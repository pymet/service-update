const util = require('util');
const exec = util.promisify(require('child_process').exec);

function isTrue(v) {
  return v === true || v && v.toLowerCase() === 'true';
}

const config = {
  pruneImages: isTrue(process.env.PRUNE_IMAGES) || false,
  pruneContainers: isTrue(process.env.PRUNE_CONTAINERS) || false,
  registry: process.env.REGISTRY || '',
  registryUser: process.env.REGISTRY_USER || '',
  registryPassword: process.env.REGISTRY_PASSWORD || '',
  verbose: isTrue(process.env.VERBOSE) || false,
  interval: process.env.INTERVAL ? parseInt(process.env.INTERVAL, 10) : 30
};

console.log('Starting service-update.');
console.log('Configuration: ', config);

async function getServices() {
  const { stdout, stderr } = await exec('docker service ls --format "{{.Name}}"');
  if (stderr) {
    throw new Error('Cannot read services');
  }
  return stdout.split('\n').filter(it => !!it).map(it => {
    return { name: it };
  });
}

async function getServiceInfo(name) {
  const { stdout, stderr } = await exec(`docker service inspect ${name}`);
  if (stderr) {
    throw new Error(`Cannot read service information for ${name}: ${stderr}`);
  }
  try {
    var data = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Cannot parse service information for ${name}`);
  }
  return {
    name,
    labels: data[0].Spec.Labels,
    enabled: data[0].Spec.Labels['com.pymet.servicereload.watch'] === 'true',
    image: data[0].Spec.Labels['com.docker.stack.image']
  };
}

async function pullImage(image) {
  if (config.verbose) {
    console.log(`Checking new images of ${image}`);
  }
  const { stdout, stderr } = await exec(`docker pull ${image}`);
  if (stderr) {
    throw new Error('Cannot pull images ' + stderr);
  }
  if (stdout.indexOf(`Image is up to date for ${image}`) !== -1) {
    if (config.verbose) {
      console.log(`No new image for ${image}`);
    }
    return false;
  }
  if (stdout.indexOf(`Downloaded newer image for ${image}`) !== -1) {
    console.log(`Downloaded newer image for ${image}`);
    return true;
  }
  if (stderr) {
    throw new Error('Unknown pull response');
  }
}

async function updateService(service) {
  console.log(`Updating service ${service.name}`);
  const { stdout, stderr } = await exec(`docker service update --force --image ${service.image} ${service.name} --detach=false`);
  console.log(`Service ${service.name} is updated: ${stdout}`);
  if (stderr) {
    throw new Error('Cannot update service: ' + stderr);
  }
}

async function login(registry, username, password) {
  const { stdout, stderr } = await exec(`docker login ${registry} -u="${username}" -p="${password}"`);
  if (stderr) {
    throw new Error(`Cannot login: ${stderr}`);
  }
  console.log(`Logging in: ${stdout}`);
}

async function cleanup() {
  if (config.pruneContainers) {
    console.log('Removing stopped containers.');
    await exec('docker container prune -f');
    console.log('Stopped containers removed.');
  }
  if (config.pruneImages) {
    console.log('Removing untagged images.');
    await exec('docker rmi $(docker images -q --filter "dangling=true")');
    console.log('Untagged images removed.');
  }
}

async function watch() {
  const services = await getServices();
  const serviceInfo = await Promise.all(services.map(service => getServiceInfo(service.name)));
  const enabledServices = serviceInfo.filter(service => service.enabled);
  if (config.verbose) {
    console.log('Detected services: ');
    console.log(enabledServices.map(service => `${service.name} ${service.image}`).join('\n'));
  }
  enabledServices.forEach(async service => {
    const imageDownloaded = await pullImage(service.image);
    if (imageDownloaded) {
      await updateService(service);
      await cleanup();
    }
  });
  
  setTimeout(watch, config.interval * 1000);
}

async function init() {
  const loginInfo = await login(config.registry, config.registryUser, config.registryPassword);
  watch();
}

try {
  init();
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}

process.on('SIGINT', () => {
  console.info('Got SIGINT (aka ctrl-c in docker). Graceful shutdown ', new Date().toISOString());
  process.exit();
});

// quit properly on docker stop
process.on('SIGTERM', () => {
  console.info('Got SIGTERM (docker container stop). Graceful shutdown ', new Date().toISOString());
  process.exit();
})
