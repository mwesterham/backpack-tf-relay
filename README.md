### Starting

```
docker build -t backpack-tf-relay:local .
```

```
docker run -p 8080:8080 -e SOURCE_URL="wss://ws.backpack.tf/events" backpack-tf-relay:local
```