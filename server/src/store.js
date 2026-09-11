module.exports = process.env.VERCEL ? require("./store.memory") : require("./store.sqlite");
