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
// const allowedOrigins = [
//   'http://localhost:4200',      // duplicated project
//   'http://localhost:4000',      // angularBoilerplate
//   'http://localhost:3000',      // nextjs frontend
//   'http://221.121.99.208:4200',    // your other device (keep or remove as needed)
//   'inventory-management-system-liard-eta.vercel.app'
// ];
// app.use(cors({
//   origin: function(origin, callback){
//     // allow requests with no origin (like mobile apps or curl)
//     if(!origin) return callback(null, true);
//     if(allowedOrigins.indexOf(origin) !== -1){
//       callback(null, true);
//     } else {
//       callback(new Error('CORS policy does not allow access from this origin'));
//     }
//   },
//   credentials: true
// }));

const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:3000',
  'https://inventory-management-system-liard-eta.vercel.app', // <-- frontend on Vercel (include https)
  'https://inventory-management-system-vy5y.onrender.com'     // <-- backend origin (if you need it)
];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // reject other origins (CORS will fail on browser side)
    return callback(new Error('CORS policy does not allow access from this origin: ' + origin));
  },
  credentials: true,          // allow cookies (if needed)
  optionsSuccessStatus: 200   // some old browsers choke on 204 for preflight
}));

// ensure preflight OPTIONS are handled
app.options('*', cors({ origin: allowedOrigins, credentials: true }));

// ─── SERVE UPLOADS DIRECTORY ────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
// ─── API ROUTES ────────────────────────────────────────────────
app.use('/rooms',       require('./_controllers/room.controller'));
app.use('/accounts',    require('./_controllers/account.controller'));
app.use('/qr',          require('./_controllers/qr.controller'));
app.use('/req-stock',   require('./_controllers/request.stock.controller'));
app.use('/req-item',    require('./_controllers/request.item.controller'));
app.use('/transfers',   require('./_controllers/transfer.controller'));
app.use('/borrows',     require('./_controllers/borrow.controller'));

// ─── SWAGGER DOCS ROUTES ────────────────────────────────────────────────
app.use('/api-docs',    require('./_helpers/swagger'));

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────
app.use(errorHandler);

// ─── START SERVER ────────────────────────────────────────────────
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 10000): 5000;
app.listen(port, () => console.log('Server listening on port' + port));
// const PORT = process.env.PORT || 10000;
// app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
// const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 80) : 5000;
// app.listen(port, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${port}`));