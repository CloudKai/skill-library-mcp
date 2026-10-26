import express from 'express';
import { createDemoApp } from './dist/demo-http.js';
const app = express();
app.use(createDemoApp());
export default app;
