//Invoked from API Gateway with Lambda Proxy Integration
//

import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const tableName = process.env.TABLE_NAME;
    const userID = event.userID; 
    const depositAmount = event.amount; 
    
    if (typeof depositAmount !== 'number' || depositAmount <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bad Request: Request is NaN or less than 0.' })
        };
    }

    // Query PortfolioDB for current account balance
    const currentDate = new Date();
    const isoDate = currentDate.toISOString();

    try {
        const queryParams = {
            TableName: tableName,
            KeyConditionExpression: 'userID = :userID',
            ExpressionAttributeValues: {
                ':userID': { S: userID }
            },
            ScanIndexForward: false,
            Limit: 1
        };

        const queryCommand = new QueryCommand(queryParams);
        const queryResult = await client.send(queryCommand);

        let currentBalance = 0;

        if (queryResult.Items.length > 0) {
            const latestItem = queryResult.Items[0];
            if (latestItem.balance && latestItem.balance.N) {
                currentBalance = parseFloat(latestItem.balance.N);
            }
        } else {
            console.log('Message: queryResult.Items.length equals zero.')
        }

        // Update balance
        const newBalance = currentBalance + depositAmount;
        const uuid = uuidv4();

        const params = {
            TableName: tableName,
            Item: {
                userID: { S: userID },
                metadata: { S: 'ACCOUNT#DEPOSIT' },
                date: { S: isoDate }, 
                price: { N: '0' }, 
                change: { N: depositAmount.toString() }, 
                balance: { N: newBalance.toString() } ,
                units: { N: '0' },
                uuid: {S: uuid }
            }
        };

        // Insert new entry into PortfolioDB
        const putCommand = new PutItemCommand(params);
        await client.send(putCommand);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Account deposit successful!' })
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Fatal error in processing deposit.' })
        };
    }
};
