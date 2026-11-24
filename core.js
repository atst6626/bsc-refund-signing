export const CONTRACT='0xae8a7e31076f4ccf7373ec043f43d9c307b46434';
export const RECIPIENT='0xd53dd86b7a7aec21589ebb06de978e3cb714c11f';
export const INVESTOR='0x0e566836cff38dde506ef70d9b7ef84b17e72ee9';
export const AMOUNT=400000000000000000n;
export const RPCS=['https://bsc-dataseed.bnbchain.org','https://bsc-dataseed1.binance.org'];
export const S={owner:'0x8da5cb5b',operators:'0x27a099d8',count:'0x807f0971',request:'0xcc0fe4a4',confirmed:'0xa4a0e232',available:'0xef96bb59',create:'0x750b5a19',confirm:'0xda0f57d0',execute:'0x2104ebf1'};
export const pad=n=>BigInt(n).toString(16).padStart(64,'0');
export const addressWord=a=>a.toLowerCase().slice(2).padStart(64,'0');
export function words(v){if(!/^0x(?:[0-9a-fA-F]{64})*$/.test(v))throw Error('链上返回数据格式错误');return v.slice(2).match(/.{64}/g)||[];}
export function decodeRequest(v,id){const w=words(v);if(w.length<6)throw Error('申请数据不完整');return {id,to:'0x'+w[0].slice(-40).toLowerCase(),amount:BigInt('0x'+w[1]),executed:BigInt('0x'+w[2])!==0n,confirmed:Number(BigInt('0x'+w[3])),required:Number(BigInt('0x'+w[4]))};}
export const matches=r=>r.to.toLowerCase()===RECIPIENT&&r.amount===AMOUNT;
export function bnb(n){const v=BigInt(n),s=v.toString().padStart(19,'0');return s.slice(0,-18)+'.'+(s.slice(-18).replace(/0+$/,'')||'0');}
export function actions({account,owner,admins,request,duplicate,confirmed,busy,available}){const admin=admins.includes(account),isOwner=!!account&&account===owner;return {create:!busy&&isOwner&&!request&&available>=AMOUNT,confirm:!busy&&admin&&!!request&&!duplicate&&!request.executed&&!confirmed,execute:!busy&&isOwner&&!!request&&!duplicate&&!request.executed&&request.confirmed>=request.required&&request.required===3&&available>=AMOUNT};}
