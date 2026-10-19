const crypto = require('crypto');

const CONVEX_URL = 'https://graceful-blackbird-506.convex.cloud';
const CONVEX_TOKEN = 'prod:graceful-blackbirds-56leJ2M1I6IBlG0WlGTzR0NGUSONJWYWMQ4ZjhemnZIn';

async function callConvex(functionName, args = {}) {
  try {
    const response = await fetch(`${CONVEX_URL}/api/functions/students/${functionName}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONVEX_TOKEN}`
      },
      body: JSON.stringify(args)
    });
    const data = await response.json();
    return data;
  } catch (e) {
    console.error('Convex Error:', e);
    return null;
  }
}

function sendJson(res, status, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isValidUIUStudentId(id) { return /^\d{10}$/.test(String(id || '').trim()); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, savedHash) {
  if (!savedHash) return false;
  const [salt, hash] = savedHash.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const body = req.body;
    const url = (req.url || '').toLowerCase();

    if (url.includes('info')) {
      sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running', db: 'Convex' });
      return;
    }
    if (url.includes('signup')) {
      const { name, email, studentId, password } = body || {};
      const id = String(studentId || '').trim();
      if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Invalid input data.' });
        return;
      }
      const existing = await callConvex('getById', { id });
      if (existing) {
        sendJson(res, 409, { error: 'Student ID already exists.' });
        return;
      }
      await callConvex('create', { id, name, email, passwordHash: hashPassword(password) });
      sendJson(res, 201, { student: { id, name } });
      return;
    }
    if (url.includes('login')) {
      const { studentId, password } = body || {};
      const id = String(studentId || '').trim();
      const student = await callConvex('getById', { id });
      if (!student || !verifyPassword(password || '', student.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid credentials.' });
        return;
      }
      sendJson(res, 200, { student: { id: student.id, name: student.name } });
      return;
    }
    if (url.includes('profile')) {
      const { studentId, name, phone, password, profilePhoto } = body || {};
      const id = String(studentId || '').replace(/\D/g, '');
      const student = await callConvex('getById', { id });
      if (!student) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }
      const updates = {};
      if (name) updates.name = name;
      if (phone) updates.phone = phone;
      if (profilePhoto) updates.profilePhoto = profilePhoto;
      if (password) updates.passwordHash = hashPassword(password);
      await callConvex('update', { id, ...updates });
      sendJson(res, 200, { student: { ...student, ...updates } });
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    sendJson(res, 500, { error: 'Internal Server Error: ' + e.message });
  }
};
