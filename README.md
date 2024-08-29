



# Lambda-Library [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description

A free library of Lambda functions for AWS. Instructions on packaging for upload to the Lambda console are below.

This provides an example of querying a dynamoDB database with a single-table design using metadata for a local secondary index. These are typically invoked through Lambda integration into API gateway, but some are designed to be run from the Lambda console for dev purposes as well.

## Installation

Clone or fork the repository into your local repo. Each folder will contain the required package.json file. Navigate to the containing directory in your terminal and run the following in your code editor to install the required packages:

```
npm i
```
Installation will generate the 'node_modules' folder required for uploading to the Lambda console.

## Usage

In order to upload a Lambda function to AWS, you need to package it in a .zip file. The .zip file must contain the following files at the root directory: 'package.json', 'node_modules', and 'index.mjs'. 'package.json' will contain instructions for Lambda to manage your node modules. 'node_modules' is a folder containing the files required by each node module, and enables your script to utilize outside libraries from npm. 'index.mjs' is an ES6 module file containing your Lambda script. 

These files will all exist in your remote's directory. Simply select all 3 files and compress to a .zip file using your preferred archiver.

You can also navigate to the containing directory in your terminal and run the following:
```
zip lambdapackage.zip index.js package.json node_modules
```

## License

To know more about the MIT license please visit https://opensource.org/licenses/MIT.

## Collaboration

Please improve upon this code within the limitations of its license. Any input will be appreciated. Fork approval will only be required for first-time contributors.