# poc-mediasoup-room

A POC of a videochat room web app using two mediasoup workers and one load-balancer.

## Build images

```
$ docker-compose build
```

## Start containers

```
$ docker-compose up
```

## Access client

<http://localhost:3000>

### Known Issues

When running both media-worker and client locally on Firefox, you have to set `media.peerconnection.ice.loopback` to `true` on `about:config`.
