import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {

    const corsHeaders = {
        "Access-Control-Allow-Origin": "http://localhost:4200",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    };
    
    const userID = event.queryStringParameters?.userID;
    const ticker = event.queryStringParameters?.ticker;

    if (!userID || !ticker) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Bad Request: userID and ticker are required parameters.' })
        };
    }

    try {
        const queryTransactionsByType = async (metadataType) => {
            const queryParams = {
                TableName: process.env.ENTRY_TABLE_NAME,
                IndexName: process.env.LSIName,
                KeyConditionExpression: 'userID = :userID AND begins_with(#LSI_NAME, :metadata)',
                ExpressionAttributeNames: {
                    '#LSI_NAME': process.env.LSIName
                },
                ExpressionAttributeValues: {
                    ':userID': { S: userID },
                    ':metadata': { S: `${ticker}#${metadataType}` }
                },
                ScanIndexForward: false,
                ConsistentRead: true
            };

            const queryCommand = new QueryCommand(queryParams);
            const queryResult = await dynamoClient.send(queryCommand);
            return queryResult.Items || [];
        };

        const buyTransactions = await queryTransactionsByType('BUY');
        const sellTransactions = await queryTransactionsByType('SELL');

        const transactions = {
            buy: buyTransactions,
            sell: sellTransactions
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(transactions)
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
