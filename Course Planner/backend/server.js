const crypto = require('crypto');

// We use process.env.KV_URL and process.env.KV_REST_API_TOKEN if available
// Otherwise, we fall back to a simple in-memory map for the session
// (Note: In-memory will reset on every cold start, but is better than failing)
let memoryDb = {};

async function getStudent(id) {
  if (process.env.KV_REST_API_TOKEN) {
    const response = await fetch(`${process.env.KV_REST_API_URL}/get/${id}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
    });
    return await response.json();
  }
  return memoryDb[id];
}

async function setStudent(id, data) {
  if (process.env.KV_REST_API_TOKEN) {
    await fetch(`${process.env.KV_REST_API_URL}/set`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ key: id, value: data })
    });
  } else {
    memoryDb[id] = data;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(html);
}

function isValidUIUStudentId(id) {
  return /^\d{10}$/.test(String(id || '').trim());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

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

function publicStudent(student) {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone || '',
    profilePhoto: student.profilePhoto || ''
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const { body } = req;
    const url = req.url || '';

    if (req.method === 'GET' && (url === '/api' || url === '/')) {
       sendHtml(res, 200, '<h1>Backend is running</h1><p>Database: ' + (process.env.KV_REST_API_TOKEN ? 'Vercel KV' : 'In-Memory (Temporary)') + '</p>');
       return;
    }
    if (req.method === 'GET' && (url === '/api/info' || url === '/info')) {
      sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running', db: process.env.KV_REST_API_TOKEN ? 'KV' : 'Memory' });
      return;
    }

    if (req.method === 'POST' && (url === '/api/signup' || url === '/signup')) {
      const { name, email, studentId, password } = body || {};
      const id = String(studentId || '').trim();
      if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Valid data required.' });
        return;
      }
      const existing = await getStudent(id);
      if (existing) {
        sendJson(res, 409, { error: 'Student ID exists.' });
        return;
      }
      const studentData = { id, name: String(name).trim(), email: String(email).trim(), passwordHash: hashPassword(password) };
      await setStudent(id, studentData);
      sendJson(res, 201, { student: { id, name: studentData.name } });
      return;
    }

    if (req.method === 'POST' && (url === '/api/login' || url === '/login')) {
      const { studentId, password } = body || {};
      const id = String(studentId || '').trim();
      const student = await getStudent(id);
      if (!student || !verifyPassword(password || '', student.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid credentials.' });
        return;
      }
      sendJson(res, 200, { student: publicStudent(student) });
      return;
    }

    if (req.method === 'POST' && (url === '/api/profile' || url === '/profile')) {
      const { studentId, name, phone = '', password = '', profilePhoto = '' } = body || {};
      const id = String(studentId || '').replace(/\D/g, '');
      const student = await getStudent(id);
      if (!student) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }
      student.name = String(name).trim();
      student.phone = String(phone).trim();
      student.profilePhoto = String(profilePhoto);
      if (password) student.passwordHash = hashPassword(String(password));
      await setStudent(id, student);
      sendJson(res, 200, { student: publicStudent(student) });
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { error: 'Server error: ' + error.message });
  }
};
