# AlgoreaForum

## Installation

```sh
npm ci
npx sls dynamodb install
```

## Start

```sh
npm start
```


## Test

```sh
npm test
```

## Deploy code on AWS

```sh
sls deploy [-f <function name>] --aws-profile <aws profile>
```

If you do global changes (for instance the role permissions), you need to deploy with specifying any function.
 
## Create a release

In order to create a release:
- decide of a new version number (using semver)
- update the changelog (add a new section, with the date of today and listing the fix and new features)
- commit this change as a commit "Release vx.y.z"
- tag the current commit "vx.y.z" (`git tag -a -m "Release vx.y.z" vx.y.z`)
- push everything (`git push origin master; git push origin vx.y.z`)
- the rest (github release) is done by the CI
