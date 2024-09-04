//Invoked from API Gateway with Lambda Proxy Integration

import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: process.env.REGION_NAME });

export const handler = async (event) => {
    const tableName = process.env.TABLE_NAME;
    const { userID,  transactionAmount, uuid } = event;
    if (typeof transactionAmount !== 'number' || transactionAmount == 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bad Request: Request is NaN or 0.' })
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
            if (latestItem.balance && latestItem.value.N) {
                currentBalance = parseFloat(latestItem.value.N);
            }
        } else {
            console.log('Message: queryResult.Items.length equals zero.')
        }

        if (transactionAmount < 0 && currentBalance < Math.abs(transactionAmount)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Withdraw request exceeds allowable funds.' })
            };
        }

        // Update balance
        const uuidString = uuid ? uuid : 'null';
        const newBalance = currentBalance + transactionAmount;
        const transactionType = transactionAmount > 0 ? 'ACCOUNT#DEPOSIT' : 'ACCOUNT#WITHDRAW';
        const params = {
            TableName: tableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate}, 
                metadata: {S: transactionType},
                value: {N: transactionAmount} ,
                units: {N: '0'},
                balance: {N: newBalance.toString()},
                uuid: {S: uuidString}
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
