import express from 'express';
import { createHostedApp } from './dist/demo/http-app.js';
const app = express();
app.use(createHostedApp());
export default app;
