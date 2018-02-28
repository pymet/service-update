# service-update
Update Docker services automatically.

Example:

```version: '3.3'
services:
  service-update:
    image: daninet/service-update:latest
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - REGISTRY=registry.yourdomain.com
      - REGISTRY_USER=admin
      - REGISTRY_PASSWORD=password
      - VERBOSE=true
      - PRUNE_CONTAINERS=true
      - PRUNE_IMAGES=true
      - INTERVAL=10
    deploy:
      restart_policy:
        condition: on-failure
  example-watched-app:
    image: registry.yourdomain.com/name/example-watched-app:latest
    deploy:
      labels:
        - "com.pymet.servicereload.watch=true"
      restart_policy:
        condition: on-failure```
