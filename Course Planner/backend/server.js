const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '{}');
}

function readStudents() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
}

function writeStudents(students) {
  ensureDataFile();
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
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

function isValidPhone(phone) {
  return !phone || /^[\d\s()+-]{7,20}$/.test(String(phone).trim());
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, savedHash) {
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

// Vercel Serverless Handler
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const { query, body } = req;
    const url = req.url || '';

    // Note: Vercel rewrites /api/(.*) to this service. 
    // The req.url might be just the part AFTER /api/
    
    if (req.method === 'GET' && (url === '/api' || url === '/')) {
       // Simplified dashboard
       sendHtml(res, 200, '<h1>Backend is running</h1><p>Use /api/info for JSON info</p>');
       return;
    }
    if (req.method === 'GET' && (url === '/api/info' || url === '/info')) {
      sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running' });
      return;
    }

    if (req.method === 'POST' && (url === '/api/signup' || url === '/signup')) {
      const { name, email, studentId, password } = body || {};
      const id = String(studentId || '').trim();
      if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Valid data required.' });
        return;
      }
      const students = readStudents();
      if (students[id]) {
        sendJson(res, 409, { error: 'Student ID exists.' });
        return;
      }
      students[id] = { id, name: String(name).trim(), email: String(email).trim(), passwordHash: hashPassword(password) };
      writeStudents(students);
      sendJson(res, 201, { student: { id, name: students[id].name } });
      return;
    }

    if (req.method === 'POST' && (url === '/api/login' || url === '/login')) {
      const { studentId, password } = body || {};
      const id = String(studentId || '').trim();
      const student = readStudents()[id];
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
      const students = readStudents();
      const student = students[id];
      if (!student) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }
      student.name = String(name).trim();
      student.phone = String(phone).trim();
      student.profilePhoto = String(profilePhoto);
      if (password) student.passwordHash = hashPassword(String(password));
      writeStudents(students);
      sendJson(res, 200, { student: publicStudent(student) });
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { error: 'Server error: ' + error.message });
  }
};
