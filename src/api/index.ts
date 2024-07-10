import http from 'node:http';

import hazel from '../lib/server';

const PORT = process.env.PORT ?? 8000;

const server = http.createServer(hazel);
server.listen(PORT);

console.log(`Running on PORT: ${PORT}`);

export default server;
