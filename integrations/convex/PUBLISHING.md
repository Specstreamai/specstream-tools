# Publishing

`@specstream/convex` is published to npm as a public package, then submitted to the [Convex components directory](https://www.convex.dev/components).

## Release checklist

```sh
npm ci                  # exactly what the lockfile pins (npm 11: npx npm@11.19.0 ci)
npm run build:clean     # clean and rebuild dist/
npm run verify          # build, test, typecheck and lint
npm pack                # inspect the tarball
```

Then sanity-check the tarball against a throwaway app, which catches a broken `exports` map that nothing else will:

```sh
mkdir /tmp/ss-consumer && cd /tmp/ss-consumer
npm init -y && npm install convex /path/to/specstream-convex-0.1.0.tgz
# add a convex/convex.config.ts that does app.use(specstream), then:
npx convex dev --once
```

All four entry points should resolve: the package root, `./convex.config.js`, `./_generated/component.js` and `./test`.

Finally:

```sh
npm login              # an account in the specstream npm org
npm publish --access public
git tag convex-v0.1.0 && git push --follow-tags
```

## The directory submission

Sign in to the Convex components submit page with the company Convex account, submit the repository (https://github.com/specstream/specstream-tools, directory `integrations/convex`) and the example app in `example/`, and read the preflight check. The review reads the public repository, not the tarball.
