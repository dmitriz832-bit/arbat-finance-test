// GitHub Pages serves app/ directly. Generate its public runtime configuration from env.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const {ARBAT_POSTHOG_TOKEN:token,ARBAT_POSTHOG_HOST:apiHost,ARBAT_APP_ORIGIN:origin,ARBAT_APP_PATH:pathPrefix}=process.env;
const config={enabled:true,token,apiHost,origin,pathPrefix};
if(!require('../app/telemetry.js').canStart(config,{origin,pathname:pathPrefix},{}))throw Error('Invalid telemetry configuration; no files written');
fs.mkdirSync(path.join(root,'app/vendor'),{recursive:true});
fs.copyFileSync(path.join(root,'node_modules/posthog-js/dist/array.no-external.js'),path.join(root,'app/vendor/posthog.js'));
fs.copyFileSync(path.join(root,'node_modules/posthog-js/LICENSE'),path.join(root,'app/vendor/posthog.LICENSE'));
fs.writeFileSync(path.join(root,'app/telemetry-config.json'),JSON.stringify(config,null,2)+'\n');
console.log('Generated public runtime config and PostHog SDK '+require('posthog-js/package.json').version);
