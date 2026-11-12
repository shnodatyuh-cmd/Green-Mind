const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const [uid, role, grade = '', className = ''] = process.argv.slice(2);
const allowed = ['student', 'teacher', 'admin', 'superAdmin'];
if (!uid || !allowed.includes(role) || grade.length > 20 || className.length > 40) {
  console.error('طريقة الاستخدام: node provision-user.js <firebase-auth-uid> <student|teacher|admin|superAdmin> [grade] [class]');
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = getFirestore();
(async () => {
  const authRecord = await require('firebase-admin/auth').getAuth().getUser(uid);
  const user = db.doc(`users/${uid}`);
  const existing = await user.get();
  if (!existing.exists) throw new Error('لم يُعثر على ملف المستخدم. اطلب منه إنشاء حساب أولًا.');
  await user.set({ role, active: true, grade, className, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ action: 'user_role_provisioned', actor: 'trusted_cli_operator', targetUid: uid, targetEmail: authRecord.email || '', assignedRole: role, createdAt: FieldValue.serverTimestamp() });
  console.log(`تم إعداد المستخدم ${uid} بدور ${role}.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
