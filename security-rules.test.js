const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc } = require('firebase/firestore');
const { ref, uploadBytes } = require('firebase/storage');

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'greenmind-rules-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') }, storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,'users/student-a'), { uid:'student-a', role:'student', active:true, email:'a@example.edu', grade:'7', className:'7A', displayName:'A', photoURL:'' });
    await setDoc(doc(db,'users/teacher-a'), { uid:'teacher-a', role:'teacher', active:true, email:'teacher@example.edu' });
    await setDoc(doc(db,'projects/project-a'), { competitionId:'contest-a', status:'approved', studentUids:['student-a'], name:'Garden' });
    await setDoc(doc(db,'competitions/contest-a'), { published:true, enabled:true, showLiveResults:false, endsAt:new Date(Date.now()+60*60*1000) });
    await setDoc(doc(db,'voteTotals/contest-a_project-a'), { competitionId:'contest-a', projectId:'project-a', count:4 });
  });
});
after(async () => { await env?.cleanup(); });

test('لا يمكن للزائر قراءة بيانات الطلاب أو تسجيل تصويت', async () => {
  const ctx = env.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(),'users/student-a')));
  await assertFails(getDoc(doc(ctx.firestore(),'projects/project-a')));
  await assertFails(getDoc(doc(ctx.firestore(),'competitions/contest-a')));
  await assertFails(setDoc(doc(ctx.firestore(),'votes/contest-a_student-a'), { voterUid:'student-a' }));
});

test('لا يمكن للطلاب ترقية صلاحياتهم أو تغيير صفوفهم أو تسجيل المشاريع', async () => {
  const db = env.authenticatedContext('student-a', { email:'a@example.edu', email_verified:true }).firestore();
  await assertFails(updateDoc(doc(db,'users/student-a'), { role:'admin' }));
  await assertFails(updateDoc(doc(db,'users/student-a'), { grade:'12' }));
  await assertFails(setDoc(doc(db,'projects/forged'), { status:'approved', name:'Forged' }));
  await assertFails(setDoc(doc(db,'challenges/forged'), { status:'published', points:1000, title:'Forged' }));
});

test('لا يمكن للطلاب تعديل الأصوات أو مجاميعها مباشرة', async () => {
  const db = env.authenticatedContext('student-a', { email:'a@example.edu', email_verified:true }).firestore();
  await assertFails(setDoc(doc(db,'votes/contest-a_student-a'), { voterUid:'student-a', projectId:'project-a' }));
  await assertFails(setDoc(doc(db,'voteTotals/contest-a_project-a'), { count:999 }));
  await assertFails(getDoc(doc(db,'voteTotals/contest-a_project-a')));
});

test('لا يستطيع المعلم تجاوز التسجيل الموثق للمشاريع', async () => {
  const db = env.authenticatedContext('teacher-a', { email_verified:true }).firestore();
  await assertFails(setDoc(doc(db,'projects/teacher-project'), { status:'pending', name:'Teacher registered' }));
});

test('تتحقق قواعد الرفع من الملكية والنوع والحجم', async () => {
  const student = env.authenticatedContext('student-a', { email_verified:true }).storage();
  await assertSucceeds(uploadBytes(ref(student,'submissions/student-a/work.png'), new Uint8Array([1,2,3]), { contentType:'image/png' }));
  await assertFails(uploadBytes(ref(student,'submissions/other-user/work.png'), new Uint8Array([1,2,3]), { contentType:'image/png' }));
  await assertFails(uploadBytes(ref(student,'submissions/student-a/work.svg'), new Uint8Array([1,2,3]), { contentType:'image/svg+xml' }));
  await assertFails(uploadBytes(ref(student,'submissions/student-a/large.png'), new Uint8Array(9*1024*1024), { contentType:'image/png' }));
});
