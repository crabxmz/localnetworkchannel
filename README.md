# Local network im webapp
This is a simple webapp for local network private temporary group messaging.

## Message type
- text
- image
- file
- audio (only from server's localhost addr to clients due to chrome security limit)

## Chat history
change `MAX_MESSAGES` to adjust cached message number in current channel, when server restart all message is invisiable.

## Run
```sh
npm i
node server.js
```
