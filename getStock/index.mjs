import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION_NAME });

export const handler = async (event) => {
    const tableName = process.env.TABLE_NAME;

    let ticker;
    try {
        const body = JSON.parse(event.body);
        ticker = body.ticker;
    } catch (parseError) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Ticker is required but not found.' })
        };
    }


    if (!ticker) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Ticker is required but not found.' })
        };
    }

    try {
        const queryParams = {
            TableName: tableName,
            KeyConditionExpression: 'ticker = :ticker',
            ExpressionAttributeValues: {
                ':ticker': { S: ticker }
            }
        };

        const queryCommand = new QueryCommand(queryParams);
        const queryResult = await dynamoClient.send(queryCommand);

        if (queryResult.Items.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'No data found for the given ticker.' })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ data: queryResult.Items })
        };
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error querying DynamoDB.' })
        };
    }
};
