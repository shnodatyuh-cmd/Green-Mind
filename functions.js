const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
initializeApp();
const db = getFirestore();

async function requireRole(uid, roles, emailVerified) {
  if (emailVerified !== true) throw new HttpsError('failed-precondition', 'Verify your school email before continuing.');
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists || snap.get('active') !== true || !roles.includes(snap.get('role'))) throw new HttpsError('permission-denied', 'You are not authorized to perform this action.');
  return snap.data();
}
function cleanString(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', `Check the ${label} field.`);
  return value.trim();
}

exports.castProjectVote = onCall({ enforceAppCheck: true, maxInstances: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to vote.');
  if (request.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your school email before voting.');
  const voterUid = request.auth.uid;
  const { competitionId, projectId } = request.data || {};
  if (![competitionId, projectId].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v))) throw new HttpsError('invalid-argument', 'Invalid competition or project.');
  await requireRole(voterUid, ['student'], request.auth.token.email_verified);
  const competitionRef = db.doc(`competitions/${competitionId}`);
  const projectRef = db.doc(`projects/${projectId}`);
  const voteRef = db.doc(`votes/${competitionId}_${voterUid}`);
  const totalRef = db.doc(`voteTotals/${competitionId}_${projectId}`);
  try {
    await db.runTransaction(async tx => {
      const [competition, project, priorVote, voter, members] = await Promise.all([tx.get(competitionRef), tx.get(projectRef), tx.get(voteRef), tx.get(db.doc(`users/${voterUid}`)), tx.get(db.doc(`projectMembers/${projectId}`))]);
      if (!competition.exists || !project.exists || !voter.exists) throw new HttpsError('not-found', 'This competition or project is unavailable.');
      const c = competition.data(), p = project.data(), u = voter.data();
      const now = Timestamp.now();
      if (c.published !== true || c.enabled !== true || !c.startsAt || !c.endsAt || now.toMillis() < c.startsAt.toMillis() || now.toMillis() >= c.endsAt.toMillis()) throw new HttpsError('failed-precondition', 'Voting is not open.');
      if (p.competitionId !== competitionId || p.status !== 'approved') throw new HttpsError('failed-precondition', 'This project is not eligible for voting.');
      if (priorVote.exists) throw new HttpsError('already-exists', 'You have already voted in this competition.');
      const eligibleGrades = c.eligibleGrades || [];
      if (eligibleGrades.length && !eligibleGrades.includes(u.grade) && !eligibleGrades.includes(u.className)) throw new HttpsError('permission-denied', 'Your class is not eligible to vote.');
      const teamUids = members.exists ? (members.get('studentUids') || []) : [];
      if (teamUids.includes(voterUid)) throw new HttpsError('permission-denied', 'Project participants cannot vote for their own project.');
      tx.create(voteRef, { competitionId, projectId, voterUid, createdAt: FieldValue.serverTimestamp() });
      tx.set(totalRef, { competitionId, projectId, count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(db.collection('auditLogs').doc(), { action: 'vote_cast', actorUid: voterUid, competitionId, projectId, createdAt: FieldValue.serverTimestamp() });
    });
    return { success: true };
  } catch (error) { if (error instanceof HttpsError) throw error; logger.error('Vote transaction failed', { uid: voterUid, competitionId, projectId }); throw new HttpsError('internal', 'Your vote could not be recorded. Please try again.'); }
});

exports.saveProject = onCall({ enforceAppCheck: true, maxInstances: 20 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  await requireRole(request.auth.uid, ['teacher', 'admin', 'superAdmin'], request.auth.token.email_verified);
  const d = request.data || {};
  const competitionId = cleanString(d.competitionId, 120, 'competition');
  if (!/^[A-Za-z0-9_-]+$/.test(competitionId)) throw new HttpsError('invalid-argument', 'Invalid competition.');
  const studentUids = Array.isArray(d.studentUids) ? [...new Set(d.studentUids.filter(x => typeof x === 'string').slice(0, 20))] : [];
  if (!studentUids.length) throw new HttpsError('invalid-argument', 'Add the account UID for each student on the project so the team cannot vote for itself.');
  if (studentUids.some(uid => !/^[A-Za-z0-9_-]{1,128}$/.test(uid))) throw new HttpsError('invalid-argument', 'Check each student account UID.');
  const members = await Promise.all(studentUids.map(uid => db.doc(`users/${uid}`).get()));
  if (members.some(s => !s.exists || s.get('role') !== 'student' || s.get('active') !== true)) throw new HttpsError('invalid-argument', 'Each project member must be an active student account.');
  const videoUrl = typeof d.videoUrl === 'string' ? d.videoUrl.trim() : '';
  if (videoUrl) { let parsed; try { parsed = new URL(videoUrl); } catch {} if (!parsed || parsed.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Use a secure https video or demo link.'); }
  const payload = { name: cleanString(d.name, 100, 'project name'), teamName: cleanString(d.teamName, 120, 'student or team names'), className: cleanString(d.className, 40, 'class'), grade: cleanString(d.grade, 20, 'grade'), description: cleanString(d.description, 1200, 'description'), category: cleanString(d.category, 40, 'category'), imagePath: cleanString(d.imagePath, 300, 'project image'), videoUrl, competitionId, status: 'pending', createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  if (!['Environmental','Technology','Scientific','Creative'].includes(payload.category)) throw new HttpsError('invalid-argument', 'Choose a valid project category.');
  if (d.projectId && (typeof d.projectId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d.projectId))) throw new HttpsError('invalid-argument', 'Invalid project.');
  const ref = d.projectId ? db.doc(`projects/${d.projectId}`) : db.collection('projects').doc();
  if (!new RegExp(`^project-images/${ref.id}/[A-Za-z0-9-]+\\.(?:jpe?g|png|webp)$`, 'i').test(payload.imagePath)) throw new HttpsError('invalid-argument', 'Upload the project image to its assigned project path.');
  const old = await ref.get();
  if (old.exists) { payload.status = 'pending'; payload.createdBy = old.get('createdBy'); payload.createdAt = old.get('createdAt'); }
  const batch = db.batch(); batch.set(ref, payload); batch.delete(db.doc(`publicProjects/${ref.id}`)); batch.set(db.doc(`projectMembers/${ref.id}`), { studentUids, updatedAt: FieldValue.serverTimestamp() }); batch.set(db.collection('auditLogs').doc(), { action: old.exists ? 'project_updated' : 'project_registered', actorUid: request.auth.uid, projectId: ref.id, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
  return { projectId: ref.id };
});

exports.reviewProject = onCall({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  await requireRole(request.auth.uid, ['teacher', 'admin', 'superAdmin'], request.auth.token.email_verified);
  const { projectId, status } = request.data || {};
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(projectId) || !['approved', 'rejected'].includes(status)) throw new HttpsError('invalid-argument', 'Invalid review request.');
  const ref = db.doc(`projects/${projectId}`);
  const old = await ref.get(); if (!old.exists) throw new HttpsError('not-found', 'Project not found.');
  const batch = db.batch(); batch.update(ref, { status, reviewedBy: request.auth.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const publicRef = db.doc(`publicProjects/${projectId}`);
  if (status === 'approved') { const p = old.data(); batch.set(publicRef, { name:p.name, teamName:p.teamName, className:p.className, grade:p.grade, description:p.description, category:p.category, imagePath:p.imagePath, videoUrl:p.videoUrl || '', competitionId:p.competitionId, status:'approved', updatedAt:FieldValue.serverTimestamp() }); }
  else batch.delete(publicRef);
  batch.set(db.collection('auditLogs').doc(), { action: `project_${status}`, actorUid: request.auth.uid, projectId, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
  return { success: true };
});

exports.saveCompetition = onCall({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  await requireRole(request.auth.uid, ['admin', 'superAdmin'], request.auth.token.email_verified);
  const d = request.data || {};
  const name = cleanString(d.name, 100, 'competition name');
  if (d.competitionId && (typeof d.competitionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d.competitionId))) throw new HttpsError('invalid-argument', 'Invalid competition.');
  const start = Date.parse(d.startsAt), end = Date.parse(d.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new HttpsError('invalid-argument', 'Choose a valid voting period.');
  if (d.enabled === true && Date.now() >= end) throw new HttpsError('invalid-argument', 'The voting deadline must be in the future.');
  const ref = d.competitionId ? db.doc(`competitions/${d.competitionId}`) : db.collection('competitions').doc();
  const old = d.competitionId ? await ref.get() : null;
  if (d.competitionId && !old.exists) throw new HttpsError('not-found', 'Competition not found.');
  const allowedGrades = Array.isArray(d.eligibleGrades) ? [...new Set(d.eligibleGrades.filter(x => typeof x === 'string').map(x => x.slice(0,20)).slice(0,80))] : [];
  await ref.set({ name, startsAt: Timestamp.fromMillis(start), endsAt: Timestamp.fromMillis(end), enabled: d.enabled === true, published: d.published === true, showLiveResults: d.showLiveResults === true, eligibleGrades: allowedGrades, updatedAt: FieldValue.serverTimestamp(), createdAt: old?.get('createdAt') || FieldValue.serverTimestamp(), createdBy: old?.get('createdBy') || request.auth.uid }, { merge: true });
  await db.collection('auditLogs').add({ action: d.competitionId ? 'competition_updated' : 'competition_created', actorUid: request.auth.uid, competitionId: ref.id, createdAt: FieldValue.serverTimestamp() });
  return { competitionId: ref.id };
});


exports.saveChallenge = onCall({ enforceAppCheck: true, maxInstances: 10 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  await requireRole(request.auth.uid, ['admin','superAdmin'], request.auth.token.email_verified);
  const d = request.data || {};
  const title = cleanString(d.title, 100, 'challenge title');
  const summary = cleanString(d.summary, 240, 'challenge summary');
  const details = cleanString(d.details, 1800, 'challenge details');
  const instructions = cleanString(d.submissionInstructions, 1000, 'submission instructions');
  const category = cleanString(d.category, 40, 'category');
  const allowedCategories = ['Cultural','Technology','Environmental','Scientific','Creative','Reading','Recycling','Community','Other'];
  if (!allowedCategories.includes(category)) throw new HttpsError('invalid-argument', 'Choose a valid challenge category.');
  if (!Number.isInteger(d.points) || d.points < 1 || d.points > 10000) throw new HttpsError('invalid-argument', 'Points must be between 1 and 10,000.');
  const starts = Date.parse(d.startsAt), ends = Date.parse(d.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new HttpsError('invalid-argument', 'Choose a valid challenge period.');
  const requirements = Array.isArray(d.requirements) ? d.requirements.map(x => cleanString(x, 160, 'requirement')).slice(0, 12) : [];
  if (!requirements.length) throw new HttpsError('invalid-argument', 'Add at least one requirement.');
  const eligibleGrades = Array.isArray(d.eligibleGrades) ? [...new Set(d.eligibleGrades.filter(x => typeof x === 'string').map(x => x.trim().slice(0,20)).filter(Boolean).slice(0,80))] : [];
  const status = ['draft','published','archived'].includes(d.status) ? d.status : null;
  if (!status) throw new HttpsError('invalid-argument', 'Choose a valid challenge status.');
  const imageUrl = typeof d.imageUrl === 'string' ? d.imageUrl.trim() : '';
  if (imageUrl) { let parsed; try { parsed = new URL(imageUrl); } catch {} if (!parsed || parsed.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Use a secure https image address.'); }
  if (d.challengeId && (typeof d.challengeId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(d.challengeId))) throw new HttpsError('invalid-argument', 'Invalid challenge.');
  const ref = d.challengeId ? db.doc('challenges/' + d.challengeId) : db.collection('challenges').doc();
  const old = d.challengeId ? await ref.get() : null;
  if (d.challengeId && !old.exists) throw new HttpsError('not-found', 'Challenge not found.');
  const record = { title, summary, details, requirements, category, points:d.points, startsAt:Timestamp.fromMillis(starts), endsAt:Timestamp.fromMillis(ends), eligibleGrades, participationType:['team','individual'].includes(d.participationType) ? d.participationType : 'individual', submissionType:['text','photo','link'].includes(d.submissionType) ? d.submissionType : 'text', submissionInstructions:instructions, imageUrl, status, createdBy:old?.get('createdBy') || request.auth.uid, createdAt:old?.get('createdAt') || FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() };
  const publicRef=db.doc(`publicChallenges/${ref.id}`);
  const publicRecord={title,summary,details,requirements,category,points:d.points,startsAt:Timestamp.fromMillis(starts),endsAt:Timestamp.fromMillis(ends),eligibleGrades,participationType:record.participationType,submissionType:record.submissionType,submissionInstructions:instructions,imageUrl,status,updatedAt:FieldValue.serverTimestamp()};
  const batch=db.batch(); batch.set(ref,record); if(status==='published')batch.set(publicRef,publicRecord);else batch.delete(publicRef); batch.set(db.collection('auditLogs').doc(),{action:d.challengeId?'challenge_updated':'challenge_created',actorUid:request.auth.uid,challengeId:ref.id,status,points:d.points,createdAt:FieldValue.serverTimestamp()}); await batch.commit();
  return { challengeId:ref.id };
});

exports.saveSiteSettings = onCall({ enforceAppCheck: true, maxInstances: 5 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  await requireRole(request.auth.uid, ['admin','superAdmin'], request.auth.token.email_verified);
  const d = request.data || {};
  const homeTitle = cleanString(d.homeTitle, 160, 'home title');
  const homeCopy = cleanString(d.homeCopy, 500, 'home description');
  const tagline = typeof d.tagline === 'string' ? d.tagline.trim().slice(0,100) : '';
  const footerCopy = typeof d.footerCopy === 'string' ? d.footerCopy.trim().slice(0,180) : '';
  const facebookUrl = typeof d.facebookUrl === 'string' ? d.facebookUrl.trim() : '';
  if (facebookUrl) {
    let u; try { u = new URL(facebookUrl); } catch {}
    if (!u || u.protocol !== 'https:' || !['facebook.com','www.facebook.com','m.facebook.com','fb.com','www.fb.com','fb.watch'].includes(u.hostname.toLowerCase())) throw new HttpsError('invalid-argument', 'Use a valid https Facebook page URL.');
  }
  const ref = db.doc('siteSettings/public');
  await db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    tx.set(ref, { homeTitle, homeCopy, tagline, footerCopy, facebookUrl, updatedAt:FieldValue.serverTimestamp(), createdAt:previous.get('createdAt') || FieldValue.serverTimestamp() });
    tx.create(db.collection('auditLogs').doc(), { action:'site_settings_updated', actorUid:request.auth.uid, fields:['homeTitle','homeCopy','tagline','footerCopy','facebookUrl'], createdAt:FieldValue.serverTimestamp() });
  });
  return { success:true };
});
