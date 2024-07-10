import http from 'node:http';

import nutela from '../lib/server';

const PORT = process.env.PORT ?? 8000;

const server = http.createServer(nutela);
server.listen(PORT);

console.log(`Running on PORT: ${PORT}`);

export default server;
