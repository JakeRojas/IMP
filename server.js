require('rootpath')();
const express         = require('express');
const app             = express();
const bodyParser      = require('body-parser');
const cookieParser    = require('cookie-parser');
const cors            = require('cors');
const errorHandler    = require('_middlewares/error-handler');
const fileUpload      = require('multer')();
const fs              = require('fs');  
const path            = require('path');
const multer          = require('multer');

// ─── JSON / URL-ENCODED PARSING ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── AUTO LOAD SERVICE MODULE TO POPULATE REGISTRY ─────────────────────────────────────────────────────
// const servicesDir = path.join(__dirname, '_services');
// fs.readdirSync(servicesDir)
//   .filter(f => f.endsWith('.service.js'))
//   .forEach(f => require(path.join(servicesDir, f)));

// ─── AUTO LOAD PLUGIN MODULES ───────────────────────────────────────────────
// const pluginsDir = path.join(__dirname, '_plugins');
// fs.readdirSync(pluginsDir)
//   .filter(f => f.endsWith('.plugin.js'))
//   .forEach(f => require(path.join(pluginsDir, f)));

// ─── MULTER DISK STORAGE ─────────────────────────────────────────────────────
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, path.join(__dirname, '..', 'uploads'));
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`);
//   }
// });
// const upload = multer({ storage });

// ─── BODY-PARSER & COOKIE ───────────────────────────────────────────────────
app.use(bodyParser.urlencoded({extended: false }));
app.use(bodyParser.json()); 
app.use(cookieParser());

// ─── FRONTEND PORT ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:4200',      // duplicated project
  'http://localhost:4000',      // angularBoilerplate
  'http://localhost:3000',      // nextjs frontend
  'http://192.168.1.14:3000'    // your other device (keep or remove as needed)
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (like mobile apps or curl)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) !== -1){
      callback(null, true);
    } else {
      callback(new Error('CORS policy does not allow access from this origin'));
    }
  },
  credentials: true
}));
// app.use(
//   cors({
//     origin: [
//       'http://localhost:3000',
//       'http://192.168.1.14:3000'
//     ],
//     credentials: true,
//   })
// );

// ─── SERVE UPLOADS DIRECTORY ────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// ─── API ROUTES ────────────────────────────────────────────────
app.use('/rooms',       require('./_controllers/room.controller'));
app.use('/accounts',    require('./_controllers/account.controller'));
app.use('/items',       require('./_controllers/item.controller'));
app.use('/apparels',    require('./_controllers/apparel.controller'));
app.use('/supplies',    require('./_controllers/adminSupply.controller'));
app.use('/qr',          require('./_controllers/qr.controller'));

// ─── SWAGGER DOCS ROUTES ────────────────────────────────────────────────
app.use('/api-docs',    require('./_helpers/swagger'));

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

// ─── START SERVER ────────────────────────────────────────────────
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 80): 5000;
app.listen(port, () => console.log('Server listening on port' + port));
// const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 80) : 5000;
// app.listen(port, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${port}`));