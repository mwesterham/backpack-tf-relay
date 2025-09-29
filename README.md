### Starting

```
docker build -t backpack-tf-relay:local .
```

```
docker run -p 8080:8080 -e SOURCE_URL="wss://ws.backpack.tf/events" backpack-tf-relay:local
```

### Vending through docker hub

```
docker tag backpack-tf-relay:local mwesterham/backpack-tf-relay:latest
```

```
docker push mwesterham/backpack-tf-relay:latest
```