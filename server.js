require('rootpath')();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const errorHandler = require('_middlewares/error-handler');
//const path = require('path');

app.use(bodyParser.urlencoded({extended: false }));
app.use(bodyParser.json()); 
app.use(cookieParser());

// allow cors requests from any origin and with credentials
//app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(
  cors({
    origin: 'http://localhost:3000', // Replace with your Next.js front-end URL
    credentials: true,
  })
);

// api routes
app.use('/api/apparel', require('./apps/apparel/apparel.controller'));
app.use('/api/stockroom', require('./apps/stockroom/stockroom.controller'));
app.use('/api/room', require('./apps/room/room.controller'));
app.use('/api/request', require('./apps/request/request.controller'));
app.use('/accounts', require('./apps/accounts/account.controller'));

// swagger docs route
app.use('/api-docs', require('./_helpers/swagger'));

// global error handler
app.use(errorHandler);

// start server
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 80): 5000;
app.listen(port, () => console.log('Server listening on port' + port));