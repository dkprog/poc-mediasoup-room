# poc-mediasoup-room

A POC of a videochat room web app using mediasoup.

### Deploy
Install [gulp-cli](https://gulpjs.com/) globally, then:

```
$ cd server/
$ gulp
$ cd ../dist/
$ rsync -avz . -e "ssh -i ~/mediasoup-dev.pem" ec2-user@34.214.137.64:~/poc-mediasoup-room/
```

Check this out [here](https://mediasoup-dev.happysurgeon.com/).

### Known Issues

When running both server and client locally on Firefox, you have to set `media.peerconnection.ice.loopback` to `true` on `about:config`.