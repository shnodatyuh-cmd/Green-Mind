import { firebaseConfig } from './firebase-config.js';
const required=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
const $=id=>document.getElementById(id);
let gm=null;
if(required.every(key=>Boolean(firebaseConfig[key]))){
 const [{initializeApp},{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,updateProfile,sendEmailVerification},{getFirestore,doc,getDoc,setDoc},{getStorage},{getFunctions}]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'),import('https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js'),import('https://www.gstatic.com/firebasejs/13.3.0/firebase-functions.js')
 ]);
 const app=initializeApp(firebaseConfig);const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),functions=getFunctions(app);
 if(firebaseConfig.appCheckSiteKey){const {initializeAppCheck,ReCaptchaV3Provider}=await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-check.js');initializeAppCheck(app,{provider:new ReCaptchaV3Provider(firebaseConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});}
 gm={app,auth,db,storage,functions,profile:null,user:null,showToast(message){const box=$('toastMessage');if(box){box.textContent=message;bootstrap.Toast.getOrCreateInstance(box,{delay:4500}).show();}}};window.GreenMind=gm;
 let authLoadRevision=0;
 onAuthStateChanged(auth,async user=>{
  const revision=++authLoadRevision;
  gm.user=user;gm.profile=null;
  let profile=null;
  if(user){try{const snap=await getDoc(doc(db,'users',user.uid));if(snap.exists())profile=snap.data();}catch{}}
  if(revision!==authLoadRevision||gm.user?.uid!==user?.uid)return;
  gm.profile=profile;
  document.dispatchEvent(new CustomEvent('greenmind-auth'));
 });
 const form=$('studentAuthForm');if(form){let creating=false;$('registerToggle').onclick=()=>{creating=!creating;$('signupFields').classList.toggle('d-none',!creating);$('studentName').required=creating;$('studentAuthSubmit').textContent=creating?'إنشاء حساب طالب':'تسجيل الدخول';$('registerToggle').textContent=creating?'لديك حساب؟ سجّل الدخول':'إنشاء حساب طالب';};form.addEventListener('submit',async e=>{e.preventDefault();const email=$('studentEmail').value.trim(),password=$('studentPassword').value;try{if(creating){const displayName=$('studentName').value.trim(),credential=await createUserWithEmailAndPassword(auth,email,password);await updateProfile(credential.user,{displayName});await setDoc(doc(db,'users',credential.user.uid),{uid:credential.user.uid,displayName,email,role:'student',active:true,className:'',grade:'',createdAt:new Date(),updatedAt:new Date()});await sendEmailVerification(credential.user);await signOut(auth);form.reset();creating=false;$('signupFields').classList.add('d-none');$('studentAuthSubmit').textContent='تسجيل الدخول';$('registerToggle').textContent='إنشاء حساب طالب';gm.showToast('تحقق من بريدك الإلكتروني ثم سجّل الدخول.');}else{await signInWithEmailAndPassword(auth,email,password);bootstrap.Modal.getOrCreateInstance($('studentAuthModal')).hide();form.reset();gm.showToast('تم تسجيل الدخول.');}}catch(error){gm.showToast(error.code==='auth/invalid-credential'?'بيانات الدخول غير صحيحة.':error.code==='auth/email-already-in-use'?'هذا البريد مسجل بالفعل.':'تعذر إتمام العملية. تحقق من البيانات وحاول مجددًا.');}});}
}
window.GreenMind=gm;
const facebook=document.querySelector('[data-site-facebook]');
if(gm){try{const {doc,getDoc}=await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js');const snap=await getDoc(doc(gm.db,'siteSettings','public'));if(snap.exists()){const data=snap.data();document.querySelectorAll('[data-home-title]').forEach(el=>{if(data.homeTitle)el.textContent=data.homeTitle;});document.querySelectorAll('[data-home-copy]').forEach(el=>{if(data.homeCopy)el.textContent=data.homeCopy;});document.querySelectorAll('[data-site-tagline]').forEach(el=>{if(data.tagline)el.textContent=data.tagline;});document.querySelectorAll('[data-footer-copy]').forEach(el=>{if(data.footerCopy)el.textContent=data.footerCopy;});if(facebook&&data.facebookUrl){facebook.href=data.facebookUrl;facebook.classList.remove('d-none');}}}catch(e){console.warn('Optional site settings are not available.',e.code);}}


// Fixed mobile section navigation for the public pages.
if (!location.pathname.toLowerCase().endsWith('/admin.html')) {
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  const items = [
    { href: './index.html', page: 'index.html', label: 'الرئيسية', icon: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>' },
    { href: './challenges.html', page: 'challenges.html', label: 'التحديات', icon: '<path d="M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/><path d="M19 2v4M17 4h4"/>' },
    { href: './voting.html', page: 'voting.html', label: 'المشاريع', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15l3-3 2 2 3-4 3 5M8 8h.01"/>' },
    { href: './results.html', page: 'results.html', label: 'النتائج', icon: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>' }
  ];
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'أقسام الموقع للموبايل');
  nav.innerHTML = items.map(item => `<a class="bottom-link${currentPage === item.page ? ' active' : ''}" href="${item.href}"${currentPage === item.page ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg><span>${item.label}</span></a>`).join('');
  document.body.appendChild(nav);
}
document.querySelectorAll('.menu-toggle').forEach(button => button.addEventListener('click', () => button.setAttribute('aria-expanded', String(document.getElementById(button.dataset.target)?.classList.toggle('show')))));




