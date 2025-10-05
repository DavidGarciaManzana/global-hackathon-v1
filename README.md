# 🚀 ACTA Global Hackathon

**24 hours to build something impressive.**

## Requirements
** You need to own a drone DJI Tello.
**You'll need Node.js and npm installed. You can download and install the binaries from here:**

https://nodejs.org/en/download/

**You will also need FFmpeg installed. Here is a great resource for installing on Mac:**

http://jollejolles.com/install-ffmpeg-on-mac-os-x/

**and for Windows:**

https://github.com/adaptlearning/adapt_authoring/wiki/Installing-FFmpeg

## Running
Make sure you power up Tello and connect to its network first. The reason is that our script sends "command" and "streamon" SDK commands to start the stream. This will not work if Tello isn't connected. After connecting to Tello run the following command from witin the tello-video-nodejs-websockets directory:

    $ node HoustonWeHaveAProblem.js

## Accessing the Video Stream
Once the code is running you can access the following url in your browser and hopefully see Tello's video stream:

    $ http://localhost:3000/index.html