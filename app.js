import {CONTRACT,RECIPIENT,INVESTOR,AMOUNT,RPCS,S,pad,addressWord,words,decodeRequest,matches,actions} from './core.js';
const $=id=>document.getElementById(id);
const explorer='https://bscscan.com';
for (const [id, address] of [['recipient', RECIPIENT], ['investor', INVESTOR]]) {
  $(id).href = explorer + '/address/' + address;
  $(id).textContent = address;
}
let wallet=null,account='',snapshot=null,busy=false,loading=false;
let operationFeedback = '';
let readFailed = false;
const rpc=async(method,params)=>{let error;for(const url of RPCS){try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('RPC HTTP '+response.status);const data=await response.json();if(data.error)throw Error(data.error.message);return data.result;}catch(e){error=e;}}throw error;};
const call=(data,block='latest')=>rpc('eth_call',[{to:CONTRACT,data},block]);
function renderFeedback() {
  const chainFeedback = readFailed ? '链上读取失败，请刷新重试。'
    : snapshot?.duplicate ? '检测到重复申请，请核对后操作。'
    : snapshot?.request?.executed ? '本次 0.4 BNB 退款已执行。' : '';
  $('feedback').textContent = [operationFeedback, chainFeedback].filter(Boolean).join(' ');
}
function showError(error) {
  operationFeedback = error.code === 4001 ? '已取消钱包操作。' : (error.message || String(error));
  renderFeedback();
}
async function readState(){const block=await rpc('eth_blockNumber',[]);const [ownerRaw,opsRaw,countRaw,availableRaw]=await Promise.all([S.owner,S.operators,S.count,S.available].map(s=>call(s,block)));const owner='0x'+words(ownerRaw)[0].slice(-40).toLowerCase(),ow=words(opsRaw),operators=ow.slice(2).map(w=>'0x'+w.slice(-40).toLowerCase());const count=Number(BigInt(countRaw));if(!Number.isSafeInteger(count)||count>2000)throw Error('申请数量超出页面读取范围');const requests=[];for(let start=1;start<=count;start+=20){requests.push(...await Promise.all(Array.from({length:Math.min(20,count-start+1)},(_,i)=>call(S.request+pad(start+i),block).then(v=>decodeRequest(v,start+i)))));}const matching=requests.filter(matches);const request=matching.find(r=>r.executed)||matching.at(-1)||null;const admins=[owner,...operators];if(admins.length!==3||new Set(admins).size!==3)throw Error('当前签名人数不是3人，请核对合约管理员配置');const confirmations=request?await Promise.all(admins.map(a=>call(S.confirmed+pad(request.id)+addressWord(a),block).then(v=>BigInt(v)!==0n))):admins.map(()=>false);return {block,owner,admins,request,duplicate:matching.length>1,confirmations,available:BigInt(availableRaw)};}
function render() {
  const s = snapshot;
  const walletLabel = $('wallet');
  walletLabel.hidden = !account;
  walletLabel.textContent = account ? '当前钱包 ' + account : '';
  renderFeedback();
  if (!s) return;

  const allowed = actions({...s, account, busy, confirmed: s.confirmations[s.admins.indexOf(account)] || false});
  for (const kind of ['create', 'confirm', 'execute']) $(kind).disabled = !allowed[kind];

  const signers = s.admins.map((address, index) => {
    const row = document.createElement('div');
    row.className = 'signer';
    const identity = document.createElement('div');
    identity.textContent = index === 0 ? '合约所有者' : '签名管理员 ' + index;
    if (address === account) identity.append(' · 当前钱包');
    const code = document.createElement('code');
    code.textContent = address;
    identity.append(code);
    row.append(identity);
    if (s.request) {
      const badge = document.createElement('span');
      badge.className = s.confirmations[index] ? 'signed' : 'pending';
      badge.textContent = s.confirmations[index] ? '已确认' : '待确认';
      row.append(badge);
    }
    return row;
  });
  $('signers').replaceChildren(...signers);
}
async function refresh() {
  if (loading || busy) return;
  loading = true;
  try {
    snapshot = await readState();
    readFailed = false;
  } catch {
    snapshot = null;
    readFailed = true;
    for (const kind of ['create', 'confirm', 'execute']) $(kind).disabled = true;
  } finally {
    loading = false;
  }
  render();
}
async function connect(){try{wallet=window.ethereum?.providers?.find(p=>p.isMetaMask)||window.ethereum;if(!wallet)throw Error('请在安装了钱包扩展的浏览器，或钱包内置浏览器中打开本页。');const accounts=await wallet.request({method:'eth_requestAccounts'});account=(accounts[0]||'').toLowerCase();wallet.on?.('accountsChanged',a=>{account=(a[0]||'').toLowerCase();refresh();});wallet.on?.('chainChanged',()=>refresh());await refresh();}catch(e){showError(e);}}
async function correctNetwork(){const chain=await wallet.request({method:'eth_chainId'});if(BigInt(chain)!==56n){try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});}catch(e){if(e.code!==4902)throw e;await wallet.request({method:'wallet_addEthereumChain',params:[{chainId:'0x38',chainName:'BNB Smart Chain',nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:[RPCS[0]],blockExplorerUrls:[explorer]}]});}if(BigInt(await wallet.request({method:'eth_chainId'}))!==56n)throw Error('请切换至 BSC 主网后操作');}}
function review(kind,r){$('review').returnValue='cancel';$('reviewTitle').textContent={create:'创建退款申请',confirm:'确认退款申请',execute:'执行退款'}[kind];$('reviewBody').textContent=`BSC 主网（56）\n合约：${CONTRACT}\n收款地址：${RECIPIENT}\n金额：0.4 BNB\n${r?'申请编号：#'+r.id:'创建后请等待链上返回申请编号'}\n本次操作钱包：${account}`;return new Promise(resolve=>{$('review').addEventListener('close',()=>resolve($('review').returnValue==='send'),{once:true});$('review').showModal();});}
async function transact(kind){if(busy||!wallet)return;busy=true;operationFeedback='';render();try{await correctNetwork();account=((await wallet.request({method:'eth_accounts'}))[0]||'').toLowerCase();snapshot=await readState();let r=snapshot.request;const allowed=actions({...snapshot,account,busy:false,confirmed:snapshot.confirmations[snapshot.admins.indexOf(account)]||false});if(!allowed[kind])throw Error('当前链上状态或钱包身份不允许这项操作，请刷新查看。');if(!await review(kind,r))return;const fresh=await readState();if((fresh.request?.id||0)!==(r?.id||0))throw Error('申请状态发生变化，请刷新后重新核对。');snapshot=fresh;r=fresh.request;const check=actions({...fresh,account,busy:false,confirmed:fresh.confirmations[fresh.admins.indexOf(account)]||false});if(!check[kind])throw Error('状态已经改变，请刷新后操作。');await correctNetwork();const accounts=await wallet.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==account)throw Error('钱包地址已改变，请重新连接。');const data=kind==='create'?S.create+addressWord(RECIPIENT)+pad(AMOUNT):S[kind]+pad(r.id);const tx={from:account,to:CONTRACT,data,value:'0x0'};await wallet.request({method:'eth_call',params:[tx,'latest']});const gas=await wallet.request({method:'eth_estimateGas',params:[tx]});tx.gas='0x'+(BigInt(gas)*120n/100n).toString(16);const hash=await wallet.request({method:'eth_sendTransaction',params:[tx]});operationFeedback='交易已提交，等待链上确认…';renderFeedback();let receipt=null;for(let i=0;i<180;i++){receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt)break;await new Promise(resolve=>setTimeout(resolve,2000));}if(!receipt)throw Error('交易仍在确认中，请在钱包查看，刷新后再操作。');if(BigInt(receipt.status)!==1n)throw Error('交易执行失败，请在钱包查看。');operationFeedback={create:'申请已创建。',confirm:'签名已确认。',execute:''}[kind];}catch(e){showError(e);}finally{busy=false;await refresh();}}
$('connect').onclick=()=>{operationFeedback='';renderFeedback();connect();};$('refresh').onclick=()=>{if(busy)return;operationFeedback='';refresh();};for(const kind of ['create','confirm','execute'])$(kind).onclick=()=>transact(kind);
refresh();setInterval(refresh,20000);
