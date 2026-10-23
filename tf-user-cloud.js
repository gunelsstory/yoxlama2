/** TicketFlow user Firebase integration.
 * Uses the same Firebase project, tfEvents/tfOrders/tfReceipts/tickets,
 * ticketTemplates/global and ticket renderer as TicketFlow Admin v3.
 * Access control MUST be enforced by server-side Firestore Security Rules.
 */
import {
  auth,store,ref,error,compress,applyImages,
  onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,
  updateProfile,updatePassword,reauthenticateWithCredential,EmailAuthProvider,
  sendPasswordResetEmail,doc,getDoc,setDoc,collection,onSnapshot,query,where,
  runTransaction
  ,authPersistenceReady
} from './tf-core.js?v=tf-auth-v4-20261023';

let currentUser=null, publicStop=null, privateStops=[],sequence=0;
// No user data or access tokens are saved. Diagnostic messages help identify unexpected Auth sign-outs.
let explicitLogout=false,hadSession=false;
const authEvents=[];
function authEvent(kind){
  authEvents.push({at:new Date().toISOString(),event:kind,app:auth.app.name,signedIn:!!auth.currentUser});
  if(authEvents.length>20)authEvents.shift();
  console.info('[TicketFlow Auth]',authEvents[authEvents.length-1]);
}
window.TFAuthDiagnostics=()=>({app:auth.app.name,authSignedIn:!!auth.currentUser,uiSignedIn:!!currentUser,trace:authEvents.slice()});

const fail=e=>{console.error('TicketFlow Firebase:',e);window.toast?.(error(e));};
const snapshotRows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
const onlyId=s=>/^[A-Za-z0-9_-]{4,120}$/.test(String(s||''));
const activeHolds=e=>Object.values(e.holds||{}).filter(h=>Number(h?.expiresAt||0)>Date.now()).reduce((n,h)=>n+Number(h.qty||0),0);
const validQuantity=q=>Number.isSafeInteger(Number(q))&&Number(q)>=1&&Number(q)<=10;
const me=()=>{if(!currentUser)throw Error('Əvvəlcə hesabınıza daxil olun.');return currentUser;};
function emit(data){window.TFUserUpdate?.(data);}
function stopPrivate(){for(const stop of privateStops)stop();privateStops=[];}
function profileFallback(user){return {id:user.uid,name:user.displayName||user.email?.split('@')[0]||'İstifadəçi',email:user.email||'',phone:'',favorites:[]};}
function watchPrivate(user,run){
  const uid=user.uid;
  // Profile metadata; actual authentication always comes from Firebase Auth.
  privateStops.push(onSnapshot(ref('tfUsers',uid),s=>{
    if(run!==sequence)return;
    const value={...profileFallback(user),...(s.exists()?s.data():{}),id:uid,email:user.email||''};
    emit({profile:value,favorites:value.favorites||[]});
  },fail));
  privateStops.push(onSnapshot(query(collection(store,'tfOrders'),where('userId','==',uid)),s=>{
    if(run!==sequence)return;emit({orders:snapshotRows(s)});
  },fail));
  privateStops.push(onSnapshot(query(collection(store,'tickets'),where('buyerUid','==',uid)),s=>{
    if(run!==sequence)return;emit({tickets:snapshotRows(s)});
  },fail));
  privateStops.push(onSnapshot(ref('tfSettings','payment'),s=>{
    if(run!==sequence)return;
    window.TF.cardNumber=s.exists()?String(s.data().cardNumber||''):'';
    window.TF.cardHolder=s.exists()?String(s.data().cardHolder||''):'';
  },fail));
  privateStops.push(onSnapshot(ref('ticketTemplates','global'),s=>{
    if(run!==sequence)return;
    const url=s.exists()?String(s.data().imageDataURL||''):'';
    window.TF.ticketTemplate=url.startsWith('data:image/jpeg;base64,')?url:'assets/ticket.jpg';
  },fail));
}
// Public events require only public read rules; no fake fallback events are shown.
publicStop=onSnapshot(collection(store,'tfEvents'),async s=>{
  const rows=snapshotRows(s);
  emit({events:rows});
  try{await applyImages(rows,()=>emit({events:rows}));}catch(e){fail(e);}
},fail);

onAuthStateChanged(auth,async user=>{
  // Gecikmiş bildiriş aktiv Firebase Auth sessiyasını qonaq rejiminə qaytarmamalıdır.
  if((user?.uid??null)!==(auth.currentUser?.uid??null)){
    authEvent('stale-state-ignored');
    return;
  }
  authEvent(user?'firebase-signed-in':'firebase-signed-out');
  if(user)hadSession=true;
  else if(hadSession&&!explicitLogout){
    // Do not fake a login. Expose the actual unexpected sign-out to diagnose it.
    console.warn('[TicketFlow Auth] Sessiya başqa yerdən və ya brauzer yaddaşından bağlandı.');
    window.toast?.('Firebase giriş sessiyası bağlandı. F12 → Console: TicketFlow Auth');
  }
  const run=++sequence;
  stopPrivate();currentUser=user;
  emit({profile:user?profileFallback(user):null,events:null,orders:[],tickets:[],favorites:[]});
  window.TF.cardNumber='';window.TF.ticketTemplate='assets/ticket.jpg';
  if(user)watchPrivate(user,run);
});

const userAPI={
  error,cardNumber:'',cardHolder:'',ticketTemplate:'assets/ticket.jpg',
  async login(mode,email,password,name=''){
    // Firebase Auth shall finish applying tab-scoped persistence before a login request.
    await authPersistenceReady;
    explicitLogout=false;
    authEvent('login-attempt');
    let cred;
    if(mode==='register'){
      if(name.trim().length<3)throw Error('Ad və soyad ən azı 3 simvol olmalıdır.');
      cred=await createUserWithEmailAndPassword(auth,email,password);
      currentUser=cred.user;
      await updateProfile(cred.user,{displayName:name.trim()});
      await setDoc(ref('tfUsers',cred.user.uid),{name:name.trim(),email:cred.user.email||email,phone:'',birthday:'',country:'Azərbaycan',favorites:[],createdAt:Date.now()},{merge:true});
    }else{
      cred=await signInWithEmailAndPassword(auth,email,password);
      currentUser=cred.user;
    }
    if(auth.currentUser?.uid!==cred.user.uid){
      authEvent('login-lost-before-profile');
      throw Error('Firebase hesabınıza giriş qısa müddətdə bağlandı. Başqa açıq tabları və brauzer sessiyasını yoxlayın.');
    }
    hadSession=true;
    authEvent('login-complete');
    // Firebase Auth təsdiqindən dərhal sonra profilin qonaq kimi görünməsinin qarşısını al.
    const instant=profileFallback(cred.user);
    emit({profile:instant,favorites:instant.favorites||[]});
    const saved=await getDoc(ref('tfUsers',cred.user.uid)).catch(()=>null);
    const p={...profileFallback(cred.user),...(saved?.exists()?saved.data():{}),id:cred.user.uid,email:cred.user.email};
    emit({profile:p,favorites:p.favorites||[]});
    return p;
  },
  async logout(){explicitLogout=true;authEvent('logout-button');try{await signOut(auth);currentUser=null;emit({profile:null,orders:[],tickets:[],favorites:[]});}catch(e){explicitLogout=false;throw e;}},
  async resetPassword(email){if(!email)throw Error('E-poçt ünvanı daxil edin.');await sendPasswordResetEmail(auth,email);},
  async reserve(eventId,qty){
    const u=me();qty=Number(qty);
    if(!onlyId(eventId)||!validQuantity(qty))throw Error('Tədbir və ya bilet sayı düzgün deyil (1–10).');
    const orderRef=doc(collection(store,'tfOrders'));
    const result=await runTransaction(store,async tx=>{
      const er=ref('tfEvents',eventId),es=await tx.get(er);
      if(!es.exists())throw Error('Tədbir mövcud deyil.');
      const ev=es.data(),price=Number(ev.price),now=Date.now(),holds={...ev.holds};
      if(ev.status!=='Satışda')throw Error('Bu tədbirdə satış aktiv deyil.');
      if(!Number.isFinite(price)||price<0)throw Error('Bilet qiyməti yanlışdır.');
      if(!Number.isSafeInteger(Number(ev.capacity)))throw Error('Tədbirin limiti yanlışdır.');
      const held=activeHolds(ev);
      if(Number(ev.capacity)-Number(ev.sold||0)-held<qty)throw Error('Kifayət qədər boş yer yoxdur.');
      const orderId=orderRef.id,expire=now+30*60*1000;
      // Order ID is a generated Firestore document ID; holds are released at review/cancel.
      holds[orderId]={qty,userId:u.uid,expiresAt:expire};
      const order={userId:u.uid,name:u.displayName||u.email?.split('@')[0]||'Alıcı',
        customerEmail:u.email||'',email:u.email||'',eventId,qty,amount:Number((price*qty).toFixed(2)),
        status:'Gözləyir',paymentStatus:'Gözləyir',receiptId:null,receiptName:'',
        tickets:[],createdAt:now,expiresAt:expire};
      tx.update(er,{holds,holdAudit:{action:'reserve',orderId,userId:u.uid}});tx.set(orderRef,order);
      return {id:orderId,...order};
    });
    return result;
  },
  async receipt(orderId,file){
    const u=me();if(!onlyId(orderId))throw Error('Sifariş nömrəsi yanlışdır.');
    const data=await compress(file,5,490000);
    const name=String(file.name||'qebz').slice(0,150);
    const or=ref('tfOrders',orderId),rr=ref('tfReceipts',orderId);
    await runTransaction(store,async tx=>{
      const os=await tx.get(or);
      if(!os.exists()||os.data().userId!==u.uid)throw Error('Sifariş sizə məxsus deyil.');
      const o=os.data();
      if(o.status!=='Gözləyir'||Number(o.expiresAt)<=Date.now())throw Error('Rezervasiyanın müddəti bitib və ya artıq yoxlanıb.');
      tx.set(rr,{userId:u.uid,orderId,kind:'receipt',data,name,uploadedAt:Date.now()});
      tx.update(or,{receiptId:orderId,receiptName:name,receiptUploadedAt:Date.now()});
    });
  },
  async cancel(orderId){
    const u=me();if(!onlyId(orderId))throw Error('Sifariş nömrəsi yanlışdır.');
    await runTransaction(store,async tx=>{
      const or=ref('tfOrders',orderId),os=await tx.get(or);
      if(!os.exists()||os.data().userId!==u.uid)throw Error('Sifariş sizə məxsus deyil.');
      const o=os.data();if(o.status!=='Gözləyir')throw Error('Təsdiqlənmiş sifarişi ləğv etmək olmaz.');
      const er=ref('tfEvents',o.eventId),es=await tx.get(er);
      if(es.exists()){
        const holds={...es.data().holds};delete holds[orderId];tx.update(er,{holds,holdAudit:{action:'cancel',orderId,userId:u.uid}});
      }
      tx.update(or,{status:'Ləğv edilib',paymentStatus:'Ləğv edilib',cancelledAt:Date.now()});
    });
  },
  async profile(data){
    const u=me();const name=String(data.name||'').trim();
    if(name.length<3||name.length>120)throw Error('Ad və soyad düzgün deyil.');
    const next={name,phone:String(data.phone||'').slice(0,40),birthday:String(data.birthday||''),country:String(data.country||'Azərbaycan'),updatedAt:Date.now()};
    await setDoc(ref('tfUsers',u.uid),next,{merge:true});
    await updateProfile(u,{displayName:name});
    emit({profile:{...profileFallback(u),...next,id:u.uid,email:u.email}});
  },
  async password(oldPassword,newPassword){
    const u=me();if(newPassword.length<6)throw Error('Yeni şifrə ən az 6 simvol olmalıdır.');
    const credential=EmailAuthProvider.credential(u.email,oldPassword);
    await reauthenticateWithCredential(u,credential);
    await updatePassword(u,newPassword);
  },
  async favorite(eventId){
    const u=me();if(!onlyId(eventId))throw Error('Tədbir nömrəsi yanlışdır.');
    const r=ref('tfUsers',u.uid);
    let isFavorite=false;
    await runTransaction(store,async tx=>{
      const s=await tx.get(r);
      const previous=Array.isArray(s.data()?.favorites)?s.data().favorites:[];
      isFavorite=!previous.includes(eventId);
      const favorites=isFavorite?[...previous,eventId]:previous.filter(x=>x!==eventId);
      tx.set(r,{favorites,updatedAt:Date.now()},{merge:true});
    });
    return isFavorite;
  }
};
window.TF=userAPI;
