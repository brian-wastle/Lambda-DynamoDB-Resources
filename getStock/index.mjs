import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION_NAME });

export const handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "http://localhost:4200",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    };

    // Handle preflight (OPTIONS) requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight response' })
        };
    }

    const tableName = process.env.TABLE_NAME;

    // Extract query string parameters
    const { ticker } = event.queryStringParameters || {};

    // Validate the query parameters
    if (!ticker) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Ticker is required.' })
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

        if (!queryResult.Items || queryResult.Items.length === 0) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'No data for this ticker.' })
            };
        }

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ data: queryResult.Items })
        };
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error querying DynamoDB.',
                ticker: ticker 
            })
        };
    }
};
