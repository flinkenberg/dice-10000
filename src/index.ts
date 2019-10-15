import ws from "ws";

const wss = new ws.Server({
  port: 8080,
});

wss.on("connection", ws => {
  ws.on("message", msg => wss.clients.forEach(cli => cli.send(`New message: ${msg}`)));
});