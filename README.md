



# Lambda-Library [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description

A free library of Lambda functions for AWS. Instructions on packaging for upload to the Lambda console are below.

This provides an example of querying a dynamoDB database with a single-table design using metadata for a local secondary index. These are typically invoked through Lambda integration into API gateway, but some are designed to be run from the Lambda console for dev purposes as well.

## Installation

Clone or fork the repository into your local repo. Each folder will contain the required package.json file. Navigate to the containing directory in your terminal and run the following in your code editor to install the required packages:

```
npm i
```
Installation will generate the 'node_modules' required for uploading to the Lambda console.

## Usage

In order to upload a Lambda function to AWS, you need to package it in a .zip file. The .zip file must contain the following files at the root directory: 'package.json', 'node_modules', and 'index.mjs'. 'package.json' and 'node_modules' will both be available after installation. 'index.mjs' is an ES6 module script file containing your Lambda code. 

These files will all exist in your remote's directory on your PC. Simply select all 3 files and compress to a .zip file using your preferred archiver.

At the time of publishing, an option to upload a .zip file is available after creating your Lambda function, from the in-browser code editing screen in your Lambda function's dashboard.

## License

To know more about the MIT license please visit https://opensource.org/licenses/MIT.

## Collaboration

Please improve upon this code within the limitations of its license. Any input will be appreciated. 
