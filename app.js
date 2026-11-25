import {CONTRACT,bnb,loadBatch,assertCanConfirm,transactionData,rpc,validateManifest} from './batch-core.js';
const $=id=>document.getElementById(id);let manifest,snapshot,account='',wallet,busy=false,loading=false;
function message(text,hash){$('activity').replaceChildren(document.createTextNode(text));if(hash){const a=document.createElement('a');a.href='https://bscscan.com/tx/'+hash;a.textContent=' 查看交易';a.target='_blank';a.rel='noopener';$('activity').append(a);}}
function render() {
  if (!snapshot) return;
  const signerIndex = snapshot.admins.indexOf(account);
  const walletLabel = $('wallet');
  walletLabel.hidden = !account;
  const role = signerIndex > 0 ? '合伙人' : signerIndex === 0 ? '管理员（请使用本机程序）' : '查看者，无确认权限';
  walletLabel.textContent = account ? account + ' · ' + role : '';

  const rows = snapshot.rows.map(row => {
    const tr = document.createElement('tr');
    const requestLabel = row.request ? '#' + row.request.id : '待创建';
    const progress = row.status === 'blocked' ? '需核对'
      : row.status === 'done' ? '已执行' : row.request ? row.request.confirmed + '/3' : '—';

    for (const value of [row.index, row.address, row.shares, bnb(row.refundWei), requestLabel, progress]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }

    const address = tr.children[1];
    address.className = 'address';
    const link = document.createElement('a');
    link.href = 'https://bscscan.com/address/' + row.address;
    link.textContent = row.address;
    link.target = '_blank';
    link.rel = 'noopener';
    address.replaceChildren(link);

    const td = document.createElement('td');
    const button = document.createElement('button');
    button.textContent = row.status === 'done' ? '已退款'
      : signerIndex > 0 && row.signatures[signerIndex] ? '你已确认' : '核对并确认';
    let allowed = false;
    try {
      assertCanConfirm(snapshot, row, account);
      allowed = true;
    } catch {}
    button.disabled = busy || !allowed;
    button.onclick = () => confirm(row.address);
    td.append(button);
    tr.append(td);
    if (row.status === 'blocked') {
      tr.title = row.reason;
      tr.className = 'blocked';
    }
    if (row.status === 'done') tr.className = 'done';
    return tr;
  });
  $('rows').replaceChildren(...rows);
}
async function refresh() {
  if (busy || loading) return;
  loading = true;
  const button = $('refresh');
  const status = $('read-status');
  button.disabled = true;
  if (!snapshot) status.textContent = '正在读取退款明细…';
  try {
    if (!manifest) {
      const response = await fetch('./batch.json', {cache: 'no-store'});
      if (!response.ok) throw Error('清单加载失败');
      manifest = validateManifest(await response.json());
    }
    snapshot = await loadBatch(manifest);
    status.textContent = '';
    render();
  } catch (error) {
    snapshot = null;
    $('rows').replaceChildren();
    status.textContent = (error.message || '读取退款明细失败') + '，请刷新状态后重试。';
  } finally {
    button.disabled = false;
    loading = false;
  }
}
async function connect(){try{wallet=window.ethereum?.providers?.find(p=>p.isMetaMask)||window.ethereum;if(!wallet)throw Error('请使用安装钱包插件的浏览器，或钱包内置浏览器。');account=((await wallet.request({method:'eth_requestAccounts'}))[0]||'').toLowerCase();wallet.on?.('accountsChanged',a=>{account=(a[0]||'').toLowerCase();refresh();});wallet.on?.('chainChanged',refresh);await refresh();}catch(e){message(e.code===4001?'已取消连接':e.message);}}
async function network(){if(BigInt(await wallet.request({method:'eth_chainId'}))!==56n)await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});if(BigInt(await wallet.request({method:'eth_chainId'}))!==56n)throw Error('请切换BSC主网');}
async function confirm(address){if(busy||!wallet)return;busy=true;render();let hash='';try{await network();account=((await wallet.request({method:'eth_accounts'}))[0]||'').toLowerCase();let s=await loadBatch(manifest),r=s.rows.find(x=>x.address===address);const id=assertCanConfirm(s,r,account);$('reviewBody').textContent=`BSC主网 · 申请 #${id}\n原地址／收款地址：\n${r.address}\n\n份数：${r.shares}\n退款：${bnb(r.refundWei)} BNB\n合约：${CONTRACT}\n钱包：${account}`;const yes=await new Promise(resolve=>{$('review').addEventListener('close',()=>resolve($('review').returnValue==='send'),{once:true});$('review').showModal();});if(!yes)return;s=await loadBatch(manifest);r=s.rows.find(x=>x.address===address);if(assertCanConfirm(s,r,account)!==id)throw Error('申请已改变，请重新核对');await network();if(((await wallet.request({method:'eth_accounts'}))[0]||'').toLowerCase()!==account)throw Error('钱包已改变');const tx={from:account,to:CONTRACT,value:'0x0',data:transactionData('confirm',r)};await wallet.request({method:'eth_call',params:[tx,'latest']});const gas=await wallet.request({method:'eth_estimateGas',params:[tx]});tx.gas='0x'+(BigInt(gas)*120n/100n).toString(16);hash=await wallet.request({method:'eth_sendTransaction',params:[tx]});message('确认交易已提交，等待回执。',hash);let receipt;for(let n=0;n<120;n++){receipt=await rpc('eth_getTransactionReceipt',[hash]);if(receipt)break;await new Promise(r=>setTimeout(r,2000));}if(!receipt)throw Error('交易仍在处理中，请查看凭证后刷新');if(BigInt(receipt.status)!==1n)throw Error('确认交易失败');message(`申请 #${id} 确认成功。`,hash);}catch(e){message(e.code===4001?'已取消钱包操作':e.message,hash);}finally{busy=false;await refresh();}}
$('connect').onclick = connect;
$('refresh').onclick = refresh;
refresh();
setInterval(refresh, 30000);
