require('rootpath')();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const errorHandler = require('_middlewares/error-handler');
const fileUpload = require('multer')();
const path = require('path');
const multer  = require('multer');

// ─── JSON / URL-ENCODED PARSING ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── MULTER DISK STORAGE ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// ─── BODY-PARSER & COOKIE ───────────────────────────────────────────────────
app.use(bodyParser.urlencoded({extended: false }));
app.use(bodyParser.json()); 
app.use(cookieParser());

// ─── FRONTEND PORT ───────────────────────────────────────────────────
app.use(
  cors({
    origin: 'http://localhost:3000',
    credentials: true,
  })
);

// ─── SERVE UPLOADS DIRECTORY ────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── API ROUTES ────────────────────────────────────────────────
app.use('/apparel', require('./_controllers/apparel.controller'));
app.use('/stockroom', require('./_controllers/stockroom.controller'));
app.use('/room', require('./_controllers/room.controller'));
app.use('/request', require('./_controllers/request.controller'));
app.use('/accounts', require('./_controllers/account.controller'));
app.use('/users', require('./_controllers/user.controller'));
app.use('/items', require('./_controllers/item.controller'));

// ─── SWAGGER DOCS ROUTES ────────────────────────────────────────────────
app.use('/api-docs', require('./_helpers/swagger'));

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

// ─── START SERVER ────────────────────────────────────────────────
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 80): 5000;
app.listen(port, () => console.log('Server listening on port' + port));