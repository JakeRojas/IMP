require('rootpath')();
const express         = require('express');
const app             = express();
const bodyParser      = require('body-parser');
const cookieParser    = require('cookie-parser');
const cors            = require('cors');
const errorHandler    = require('_middlewares/error-handler');
const path            = require('path');

// ─── JSON / URL-ENCODED PARSING ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── BODY-PARSER & COOKIE ───────────────────────────────────────────────────
app.use(bodyParser.urlencoded({extended: false }));
app.use(bodyParser.json()); 
app.use(cookieParser());

// ─── FRONTEND PORT ───────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:4200',      // duplicated project
  'http://localhost:4000',      // angularBoilerplate
  'http://localhost:3000',      // nextjs frontend
  'http://221.121.99.208:4200'    // your other device (keep or remove as needed)
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