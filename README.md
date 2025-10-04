### Starting

- Build image and run in shell

```
npm run build && docker build -t backpack-tf-relay:local . && docker run -p 8080:8080 -e SOURCE_URL="ws://klein.local:30331/forwarded" backpack-tf-relay:local
```

- In seperate terminal, connect to the port

```
npx wscat -c ws://0.0.0.0:8080/forwarded
```

- Check the prometheus metrics / Check health

```
curl http://localhost:8080/metrics
curl http://localhost:8080/healthz
```

### Vending through docker hub

```
docker tag backpack-tf-relay:local mwesterham/backpack-tf-relay:latest
```

```
docker push mwesterham/backpack-tf-relay:latest
```