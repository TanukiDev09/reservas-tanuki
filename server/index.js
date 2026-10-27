import { config } from './config.js';
import { app, connectDb } from './app.js';

await connectDb();

app.listen(config.port, () => console.log(`Avisos Tanuki en http://localhost:${config.port}`));
