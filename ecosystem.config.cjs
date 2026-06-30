module.exports = {
  apps: [
    {
      name: "sovenok-ai-bot",
      script: "src/server.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
