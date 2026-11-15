import { firebaseConfig } from './firebase-config.js';
const wait=async()=>{for(let i=0;i<100;i++){if(window.GreenMind)return window.GreenMind;await new Promise(r=>setTimeout(r,100));}return null;};const gm=await wait(),$=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toLocalInput=v=>{const d=v?.toDate?.();return d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):'';};
let challenges=[],competitions=[],projects=[];const allowed=()=>!!gm?.user?.emailVerified&&gm.profile?.active===true&&['admin','superAdmin'].includes(gm.profile.role);
const toast=x=>gm?.showToast?.(x),cat={Cultural:'ثقافي',Technology:'تقني',Environmental:'بيئي',Scientific:'علمي',Creative:'فني وإبداعي',Reading:'القراءة',Recycling:'إعادة تدوير',Community:'مجتمعي',Other:'متنوع'};
async function modules(){const [fs,auth]=await Promise.all([import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'),import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js')]);return{fs,auth};}
let sdk=null;
const errText=e=>e?.code==='permission-denied'?'تعذر الحفظ: الصلاحية غير كافية أو إحدى القيم غير مقبولة.':(e?.message&&/[\u0600-\u06FF]/.test(e.message)?e.message:'تعذر إتمام العملية. راجع المدخلات وحاول مجددًا.');
const need=(ok,msg)=>{if(!ok)throw new Error(msg);};
const idOk=(v,max=120)=>typeof v==='string'&&new RegExp('^[A-Za-z0-9_-]{1,'+max+'}$').test(v);
const isHttps=v=>{try{return new URL(v).protocol==='https:';}catch{return false;}};
const clean=(v,max,label)=>{const t=typeof v==='string'?v.trim():'';need(t&&t.length<=max,'راجع حقل: '+label+'.');return t;};
async function saveSiteSettings(d){
 if(!sdk)sdk=await modules();const f=sdk.fs;
 const homeTitle=clean(d.homeTitle,160,'العنوان الرئيسي'),homeCopy=clean(d.homeCopy,500,'وصف الرئيسية');
 const tagline=String(d.tagline||'').trim().slice(0,100),footerCopy=String(d.footerCopy||'').trim().slice(0,180),facebookUrl=String(d.facebookUrl||'').trim();
 if(facebookUrl){let u;try{u=new URL(facebookUrl);}catch{}need(u&&u.protocol==='https:'&&['facebook.com','www.facebook.com','m.facebook.com','fb.com','www.fb.com','fb.watch'].includes(u.hostname.toLowerCase()),'استخدم رابط صفحة فيسبوك صحيح يبدأ بـ https.');}
 const ref=f.doc(gm.db,'siteSettings','public'),prev=await f.getDoc(ref);
 await f.setDoc(ref,{homeTitle,homeCopy,tagline,footerCopy,facebookUrl,createdAt:(prev.exists()&&prev.get('createdAt'))||f.serverTimestamp(),updatedAt:f.serverTimestamp()});
}
async function saveChallenge(d){
 if(!sdk)sdk=await modules();const f=sdk.fs;
 const title=clean(d.title,100,'عنوان التحدي'),summary=clean(d.summary,240,'الملخص'),details=clean(d.details,1800,'التفاصيل'),submissionInstructions=clean(d.submissionInstructions,1000,'تعليمات التسليم');
 need(Object.keys(cat).includes(d.category),'اختر تصنيفًا صحيحًا.');
 need(Number.isInteger(d.points)&&d.points>=1&&d.points<=10000,'النقاط لازم تكون بين 1 و10000.');
 const s0=Date.parse(d.startsAt),e0=Date.parse(d.endsAt);need(Number.isFinite(s0)&&Number.isFinite(e0)&&e0>s0,'راجع موعد بداية ونهاية التحدي.');
 const requirements=(d.requirements||[]).map(x=>clean(x,160,'المتطلبات')).slice(0,12);need(requirements.length,'أضف متطلبًا واحدًا على الأقل.');
 const eligibleGrades=[...new Set((d.eligibleGrades||[]).map(x=>String(x).trim().slice(0,20)).filter(Boolean))].slice(0,80);
 need(['draft','published','archived'].includes(d.status),'اختر حالة صحيحة للتحدي.');
 const imageUrl=String(d.imageUrl||'').trim();need(!imageUrl||(isHttps(imageUrl)&&imageUrl.length<=500),'رابط الصورة لازم يبدأ بـ https.');
 const old=d.challengeId?challenges.find(c=>c.id===d.challengeId):null;need(!d.challengeId||old,'التحدي غير موجود.');
 const ref=d.challengeId?f.doc(gm.db,'challenges',d.challengeId):f.doc(f.collection(gm.db,'challenges'));
 const core={title,summary,details,requirements,category:d.category,points:d.points,startsAt:f.Timestamp.fromMillis(s0),endsAt:f.Timestamp.fromMillis(e0),eligibleGrades,participationType:['team','individual'].includes(d.participationType)?d.participationType:'individual',submissionType:['text','photo','link'].includes(d.submissionType)?d.submissionType:'text',submissionInstructions,imageUrl,status:d.status,votingEnabled:d.votingEnabled===true,updatedAt:f.serverTimestamp()};
 const b=f.writeBatch(gm.db),pub=f.doc(gm.db,'publicChallenges',ref.id);
 b.set(ref,{...core,createdBy:old?.createdBy||gm.user.uid,createdAt:old?.createdAt||f.serverTimestamp()});
 if(d.status==='published')b.set(pub,core);else b.delete(pub);
 const oc=competitions.find(c=>c.id===ref.id),cref=f.doc(gm.db,'competitions',ref.id);
 if(d.votingEnabled===true){b.set(cref,{name:title,startsAt:oc?.startsAt||f.Timestamp.fromMillis(s0),endsAt:oc?.endsAt||f.Timestamp.fromMillis(e0),enabled:true,published:d.status==='published',showLiveResults:oc?.showLiveResults===true,eligibleGrades,challengeId:ref.id,createdBy:oc?.createdBy||gm.user.uid,createdAt:oc?.createdAt||f.serverTimestamp(),updatedAt:f.serverTimestamp()});}
 else if(oc)b.update(cref,{published:false,enabled:false,updatedAt:f.serverTimestamp()});
 await b.commit();
}
async function saveCompetition(d){
 if(!sdk)sdk=await modules();const f=sdk.fs;
 const name=clean(d.name,100,'اسم المسابقة');
 const s0=Date.parse(d.startsAt),e0=Date.parse(d.endsAt);need(Number.isFinite(s0)&&Number.isFinite(e0)&&e0>s0,'راجع موعد البدء والانتهاء.');
 need(!(d.enabled===true&&Date.now()>=e0),'موعد انتهاء التصويت لازم يكون في المستقبل.');
 const old=d.competitionId?competitions.find(c=>c.id===d.competitionId):null;need(!d.competitionId||old,'المسابقة غير موجودة.');
 const ref=d.competitionId?f.doc(gm.db,'competitions',d.competitionId):f.doc(f.collection(gm.db,'competitions'));
 const eligibleGrades=[...new Set((d.eligibleGrades||[]).map(x=>String(x).trim().slice(0,20)).filter(Boolean))].slice(0,80);
 await f.setDoc(ref,{name,startsAt:f.Timestamp.fromMillis(s0),endsAt:f.Timestamp.fromMillis(e0),enabled:d.enabled===true,published:d.published===true,showLiveResults:d.showLiveResults===true,eligibleGrades,...(old?.challengeId?{challengeId:old.challengeId}:{}),createdBy:old?.createdBy||gm.user.uid,createdAt:old?.createdAt||f.serverTimestamp(),updatedAt:f.serverTimestamp()});
}
async function compressImage(file){
 need(/^image\/(jpeg|png|webp)$/.test(file.type),'اختر صورة JPEG أو PNG أو WebP.');need(file.size<=15*1048576,'الصورة كبيرة جدًا (الحد الأقصى 15 ميجابايت).');
 const bmp=await createImageBitmap(file);
 for(const width of [900,720,560,420]){const w=Math.min(bmp.width,width),h=Math.max(1,Math.round(bmp.height*w/bmp.width)),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(bmp,0,0,w,h);for(const q of [.8,.65,.5]){const u=c.toDataURL('image/jpeg',q);if(u.length<=150000)return u;}}
 throw new Error('تعذر تصغير الصورة. جرّب صورة أخرى.');
}
async function saveProject(d){
 if(!sdk)sdk=await modules();const f=sdk.fs;
 need(idOk(d.competitionId)&&competitions.some(c=>c.id===d.competitionId),'اختر مسابقة صحيحة.');
 const studentUids=[...new Set(d.studentUids||[])].slice(0,20);
 need(studentUids.length,'أضف معرّف حساب طالب واحد على الأقل حتى لا يصوّت الفريق لنفسه.');
 need(studentUids.every(u=>idOk(u,128)),'راجع معرّفات حسابات الطلاب.');
 const snaps=await Promise.all(studentUids.map(u=>f.getDoc(f.doc(gm.db,'users',u))));
 need(snaps.every(x=>x.exists()&&x.get('role')==='student'&&x.get('active')===true),'كل معرّف لازم يكون حساب طالب فعّال.');
  const videoUrl=String(d.videoUrl||'').trim();need(!videoUrl||(isHttps(videoUrl)&&videoUrl.length<=500),'رابط العرض لازم يبدأ بـ https.');
 need(['Environmental','Technology','Scientific','Creative'].includes(d.category),'اختر تصنيف مشروع صحيح.');
 const old=d.projectId?projects.find(p=>p.id===d.projectId):null;need(!d.projectId||old,'المشروع غير موجود.');
 const newImage=d.imageFile?await compressImage(d.imageFile):(old?.imageUrl||'');
 const ref=old?f.doc(gm.db,'projects',old.id):f.doc(f.collection(gm.db,'projects'));
 const payload={name:clean(d.name,100,'اسم المشروع'),teamName:clean(d.teamName,120,'أسماء الطلاب أو الفريق'),className:clean(d.className,40,'الفصل'),grade:clean(d.grade,20,'الصف'),description:clean(d.description,1200,'وصف المشروع'),category:d.category,imageUrl:newImage,videoUrl,competitionId:d.competitionId,status:'pending',createdBy:old?.createdBy||gm.user.uid,createdAt:old?.createdAt||f.serverTimestamp(),updatedAt:f.serverTimestamp()};
 const b=f.writeBatch(gm.db);
 b.set(ref,payload);b.delete(f.doc(gm.db,'publicProjects',ref.id));b.set(f.doc(gm.db,'projectMembers',ref.id),{studentUids,updatedAt:f.serverTimestamp()});
 await b.commit();
}
async function reviewProject(d){
 if(!sdk)sdk=await modules();const f=sdk.fs;
 const p=projects.find(x=>x.id===d.projectId);need(p,'المشروع غير موجود.');need(['approved','rejected'].includes(d.status),'حالة مراجعة غير صحيحة.');
 const b=f.writeBatch(gm.db),pub=f.doc(gm.db,'publicProjects',p.id);
 b.update(f.doc(gm.db,'projects',p.id),{status:d.status,reviewedBy:gm.user.uid,reviewedAt:f.serverTimestamp(),updatedAt:f.serverTimestamp()});
 if(d.status==='approved')b.set(pub,{name:p.name,teamName:p.teamName,className:p.className,grade:p.grade,description:p.description,category:p.category,imageUrl:p.imageUrl,videoUrl:p.videoUrl||'',competitionId:p.competitionId,status:'approved',updatedAt:f.serverTimestamp()});else b.delete(pub);
 await b.commit();
}
function gate(){const ok=allowed();$('adminGate').classList.toggle('d-none',ok);$('adminWorkspace').classList.toggle('d-none',!ok);if(ok){$('adminWelcome').textContent='أهلًا '+(gm.profile.displayName||'بك')+' — إدارة الموقع';$('adminError').textContent='';loadAll().catch(e=>{console.error(e.code);toast('تعذر تحميل بيانات الإدارة.');});}}
$('adminLoginForm').addEventListener('submit',async e=>{
 e.preventDefault();$('adminError').textContent='';$('adminVerifyButton').hidden=true;
 if(!gm)return $('adminError').textContent='إعداد Firebase غير مكتمل.';
 let stage='تسجيل الدخول';
 try{
  if(!sdk)sdk=await modules();
  const credential=await sdk.auth.signInWithEmailAndPassword(gm.auth,$('adminEmail').value.trim(),$('adminPassword').value);
  const user=credential.user;
  stage='تحديث حالة البريد';
  await sdk.auth.reload(user);
  if(user.emailVerified)await user.getIdToken(true);
  stage='قراءة مستند users';
  const snap=await sdk.fs.getDoc(sdk.fs.doc(gm.db,'users',user.uid));
  const profile=snap.exists()?snap.data():null;
  gm.user=user;gm.profile=profile;
  if(!user.emailVerified){$('adminError').textContent='تم تسجيل الدخول، لكن البريد غير مؤكّد. أرسل رابط التحقق وافتحه من صندوق البريد.';$('adminVerifyButton').hidden=false;return;}
  if(!profile){$('adminError').textContent='لم يتم العثور على مستند لهذا الحساب داخل users. تأكد أن Document ID يطابق UID في Authentication.';await sdk.auth.signOut(gm.auth);gm.user=null;gm.profile=null;return;}
  if(profile.active!==true){$('adminError').textContent='المستند موجود، لكن active يجب أن يكون Boolean وقيمته true.';await sdk.auth.signOut(gm.auth);gm.user=null;gm.profile=null;return;}
  if(!['admin','superAdmin'].includes(String(profile.role||'').trim())){$('adminError').textContent='قيمة role في المستند يجب أن تكون النص admin أو superAdmin.';await sdk.auth.signOut(gm.auth);gm.user=null;gm.profile=null;return;}
  stage='فتح لوحة الإدارة';
  gate();
 }catch(err){
  const code=String(err?.code||err?.name||'unknown');
  console.error('Green Mind admin sign-in failed:',code);
  const hint=code==='auth/invalid-credential'?'بيانات البريد أو كلمة المرور غير صحيحة.':code==='auth/too-many-requests'?'محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة.':code==='auth/network-request-failed'?'تعذر الاتصال؛ تحقق من الإنترنت.':code==='auth/operation-not-allowed'?'فعّل Email/Password في Firebase Authentication.':code==='permission-denied'?'قواعد Firestore تمنع قراءة مستند users.':'راجع رمز الخطأ لمعرفة إعداد Firebase الناقص.';
  $('adminError').textContent=`${hint} (المرحلة: ${stage}؛ الرمز: ${code})`;
 }
});$('adminVerifyButton').addEventListener('click',async()=>{
 try{
  if(!sdk)sdk=await modules();
  const user=gm?.auth?.currentUser;
  if(!user){$('adminError').textContent='سجّل الدخول أولًا ثم اطلبي رابط التحقق.';return;}
  await sdk.auth.sendEmailVerification(user);
  $('adminError').textContent='تم إرسال رابط التحقق. افتح الرسالة في البريد ثم حدّث الصفحة وسجّل الدخول مجددًا.';
 }catch(err){$('adminError').textContent='تعذر إرسال الرابط. تأكد أن البريد صحيح ومسموح به في Firebase Authentication.';}
});$('adminSignOut').onclick=async()=>{if(!sdk)sdk=await modules();await sdk.auth.signOut(gm.auth);};document.addEventListener('greenmind-auth',gate);if(!gm){$('adminError').textContent='ضع إعدادات Firebase الصحيحة في firebase-config.js.';}else{gate();}
document.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>{document.querySelector('.admin-tabs .active')?.classList.remove('active');b.classList.add('active');document.querySelectorAll('.admin-panel').forEach(p=>p.classList.add('d-none'));$(b.dataset.adminTab).classList.remove('d-none');});
async function loadAll(){if(!allowed()||!gm)return;if(!sdk)sdk=await modules();const f=sdk.fs;
 const settings=await f.getDoc(f.doc(gm.db,'siteSettings','public'));if(settings.exists()){const x=settings.data();$('siteHomeTitle').value=x.homeTitle||'';$('siteHomeCopy').value=x.homeCopy||'';$('siteTagline').value=x.tagline||'';$('siteFooterCopy').value=x.footerCopy||'';$('siteFacebookUrl').value=x.facebookUrl||'';}
 const [cs,comps,ps]=await Promise.all([f.getDocs(f.collection(gm.db,'challenges')),f.getDocs(f.collection(gm.db,'competitions')),f.getDocs(f.collection(gm.db,'projects'))]);challenges=cs.docs.map(d=>({id:d.id,...d.data()}));competitions=comps.docs.map(d=>({id:d.id,...d.data()}));projects=ps.docs.map(d=>({id:d.id,...d.data()}));renderChallenges();renderCompetitions();renderProjects();renderScores();$('projectCompetition').innerHTML=competitions.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
}
$('siteSettingsForm').addEventListener('submit',async e=>{e.preventDefault();if(!allowed())return;try{await saveSiteSettings({homeTitle:$('siteHomeTitle').value,homeCopy:$('siteHomeCopy').value,tagline:$('siteTagline').value,footerCopy:$('siteFooterCopy').value,facebookUrl:$('siteFacebookUrl').value.trim()});toast('تم حفظ إعدادات الموقع وروابطه.');}catch(e){toast(errText(e));}});
function renderChallenges(){$('adminChallengeList').innerHTML=challenges.length?challenges.map(c=>'<article class="admin-record"><div><strong>'+esc(c.title)+'</strong><small>'+esc(cat[c.category]||c.category)+' · '+Number(c.points||0)+' نقطة · '+esc({published:'منشور',draft:'مسودة',archived:'مؤرشف'}[c.status]||c.status)+'</small></div><button class="btn btn-outline-green" data-edit-challenge="'+esc(c.id)+'" type="button">تعديل</button></article>').join(''):'<p>لا توجد تحديات مسجلة.</p>';document.querySelectorAll('[data-edit-challenge]').forEach(b=>b.onclick=()=>editChallenge(challenges.find(c=>c.id===b.dataset.editChallenge)));}
function editChallenge(c){if(!c)return;$('challengeId').value=c.id;$('challengeFormTitle').textContent='تعديل تحدٍّ';$('challengeTitle').value=c.title||'';$('challengeCategory').value=c.category||'Environmental';$('challengeSummary').value=c.summary||'';$('challengeDetails').value=c.details||'';$('challengeRequirements').value=(c.requirements||[]).join('\n');$('challengePoints').value=c.points||100;$('participationType').value=c.participationType||'team';$('submissionType').value=c.submissionType||'text';$('challengeGrades').value=(c.eligibleGrades||[]).join(', ');$('challengeStart').value=toLocalInput(c.startsAt);$('challengeEnd').value=toLocalInput(c.endsAt);$('submissionInstructions').value=c.submissionInstructions||'';$('challengeImage').value=c.imageUrl||'';$('challengeStatus').value=c.status||'draft';$('challengeVoting').checked=c.votingEnabled===true;}
$('newChallenge').onclick=()=>{$('adminChallengeForm').reset();$('challengeId').value='';$('challengeFormTitle').textContent='إضافة تحدٍّ';};$('adminChallengeForm').addEventListener('submit',async e=>{e.preventDefault();if(!allowed())return;const a=$('challengeStart').value,b=$('challengeEnd').value;if(!a||!b||new Date(b)<=new Date(a))return toast('راجع موعد بداية ونهاية التحدي.');try{await saveChallenge({challengeId:$('challengeId').value||undefined,votingEnabled:$('challengeVoting').checked,title:$('challengeTitle').value,summary:$('challengeSummary').value,details:$('challengeDetails').value,requirements:$('challengeRequirements').value.split('\n').map(x=>x.trim()).filter(Boolean),category:$('challengeCategory').value,points:Number($('challengePoints').value),startsAt:new Date(a).toISOString(),endsAt:new Date(b).toISOString(),eligibleGrades:$('challengeGrades').value.split(/[,،]/).map(x=>x.trim()).filter(Boolean),participationType:$('participationType').value,submissionType:$('submissionType').value,submissionInstructions:$('submissionInstructions').value,imageUrl:$('challengeImage').value,status:$('challengeStatus').value});$('adminChallengeForm').reset();$('challengeId').value='';await loadAll();toast('تم حفظ التحدي.');}catch(e){toast(errText(e));}});
function renderCompetitions(){$('adminCompetitionList').innerHTML=competitions.length?competitions.map(c=>'<article class="admin-record"><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.published?'منشورة':'مسودة')+' · '+esc(c.enabled?'التصويت مفعّل':'التصويت متوقف')+'</small></div><button class="btn btn-outline-green" data-edit-comp="'+esc(c.id)+'" type="button">تعديل</button></article>').join(''):'<p>لا توجد مسابقات.</p>';document.querySelectorAll('[data-edit-comp]').forEach(b=>b.onclick=()=>{const c=competitions.find(x=>x.id===b.dataset.editComp);if(!c)return;$('competitionId').value=c.id;$('competitionFormTitle').textContent='تعديل المسابقة';$('competitionName').value=c.name||'';$('eligibleGrades').value=(c.eligibleGrades||[]).join(', ');$('competitionStart').value=toLocalInput(c.startsAt);$('competitionEnd').value=toLocalInput(c.endsAt);$('competitionEnabled').checked=!!c.enabled;$('competitionPublished').checked=!!c.published;$('competitionLive').checked=!!c.showLiveResults;});}
$('newCompetition').onclick=()=>{$('adminCompetitionForm').reset();$('competitionId').value='';$('competitionFormTitle').textContent='إضافة مسابقة';};$('adminCompetitionForm').addEventListener('submit',async e=>{e.preventDefault();if(!allowed())return;try{await saveCompetition({competitionId:$('competitionId').value||undefined,name:$('competitionName').value,startsAt:new Date($('competitionStart').value).toISOString(),endsAt:new Date($('competitionEnd').value).toISOString(),eligibleGrades:$('eligibleGrades').value.split(/[,،]/).map(x=>x.trim()).filter(Boolean),enabled:$('competitionEnabled').checked,published:$('competitionPublished').checked,showLiveResults:$('competitionLive').checked});await loadAll();toast('تم حفظ المسابقة.');}catch(e){toast(errText(e));}});
async function renderProjects(){$('adminProjectList').innerHTML=projects.length?projects.map(p=>'<article class="admin-record"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.teamName||'')+' · '+esc({pending:'قيد المراجعة',approved:'معتمد',rejected:'مرفوض'}[p.status]||p.status)+'</small></div><div class="record-actions"><button class="btn btn-outline-green" data-edit-project="'+esc(p.id)+'" type="button">تعديل</button>'+(p.status!=='approved'?'<button class="btn btn-forest" data-review-project="approved" data-project-id="'+esc(p.id)+'" type="button">اعتماد</button>':'')+(p.status!=='rejected'?'<button class="btn btn-outline-green" data-review-project="rejected" data-project-id="'+esc(p.id)+'" type="button">رفض</button>':'')+'</div></article>').join(''):'<p>لا توجد مشاريع مسجلة.</p>';document.querySelectorAll('[data-review-project]').forEach(b=>b.onclick=async()=>{try{await reviewProject({projectId:b.dataset.projectId,status:b.dataset.reviewProject});await loadAll();toast('تم حفظ المراجعة.');}catch(e){toast(errText(e));}});document.querySelectorAll('[data-edit-project]').forEach(b=>b.onclick=async()=>{const p=projects.find(x=>x.id===b.dataset.editProject);if(!p)return;$('projectId').value=p.id;$('projectCompetition').value=p.competitionId;$('projectName').value=p.name||'';$('projectTeam').value=p.teamName||'';$('projectClass').value=p.className||'';$('projectGrade').value=p.grade||'';$('projectCategory').value=p.category||'Environmental';$('projectDescription').value=p.description||'';$('projectVideo').value=p.videoUrl||'';const f=sdk.fs,m=await f.getDoc(f.doc(gm.db,'projectMembers',p.id));$('projectMembers').value=m.exists()?(m.data().studentUids||[]).join(', '):'';});}
$('adminProjectForm').addEventListener('submit',async e=>{e.preventDefault();if(!allowed())return;try{await saveProject({projectId:$('projectId').value||undefined,competitionId:$('projectCompetition').value,name:$('projectName').value,teamName:$('projectTeam').value,className:$('projectClass').value,grade:$('projectGrade').value,category:$('projectCategory').value,description:$('projectDescription').value,videoUrl:$('projectVideo').value,imageFile:$('projectImage').files[0]||null,studentUids:$('projectMembers').value.split(/[,،\s]+/).map(x=>x.trim()).filter(Boolean)});$('adminProjectForm').reset();$('projectId').value='';await loadAll();toast('تم حفظ المشروع (قيد المراجعة حتى تعتمده).');}catch(e){toast(errText(e));}});
async function renderScores(){if(!competitions.length){$('adminVoteScores').innerHTML='<p>أنشئ مسابقة لمتابعة أصوات المشاريع.</p>';return;}const f=sdk.fs;const blocks=[];for(const c of competitions){const q=await f.getDocs(f.query(f.collection(gm.db,'voteTotals'),f.where('competitionId','==',c.id)));const counts=q.docs.map(d=>d.data());const total=counts.reduce((n,x)=>n+(Number(x.count)||0),0);const names=new Map(projects.filter(p=>p.competitionId===c.id).map(p=>[p.id,p.name]));const rows=counts.map(x=>({name:names.get(x.projectId)||'مشروع غير متاح',votes:Number(x.count)||0})).sort((a,b)=>b.votes-a.votes);blocks.push('<article class="score-panel"><h3>'+esc(c.name)+' · '+total+' صوت</h3>'+(rows.length?rows.map((r,i)=>'<p><b>'+String(i+1).padStart(2,'0')+'</b> '+esc(r.name)+' <strong>'+r.votes+' نقطة / '+r.votes+' صوت</strong></p>').join(''):'<small>لم تُسجّل أصوات بعد.</small>')+'</article>');}$('adminVoteScores').innerHTML='<h3>إحصاءات التصويت للمشرف</h3>'+blocks.join('');}



