import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION_NAME });

export const handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "http://localhost:4200",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight response' })
        };
    }

    const tableName = process.env.TABLE_NAME;
    const { ticker } = event.queryStringParameters || {};

    if (!ticker) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Ticker is required.' })
        };
    }

    try {
        //query for prices
        const entriesQueryParams = {
            TableName: tableName,
            KeyConditionExpression: 'ticker = :ticker',
            ExpressionAttributeValues: {
                ':ticker': { S: ticker }
            }
        };

        const entriesQueryCommand = new QueryCommand(entriesQueryParams);
        const entriesQueryResult = await dynamoClient.send(entriesQueryCommand);

        // metadata query
        const metadataTicker = `${ticker}#metadata`;
        const metadataQueryParams = {
            TableName: tableName,
            KeyConditionExpression: 'ticker = :ticker',
            ExpressionAttributeValues: {
                ':ticker': { S: metadataTicker }
            }
        };

        const metadataQueryCommand = new QueryCommand(metadataQueryParams);
        const metadataQueryResult = await dynamoClient.send(metadataQueryCommand);

        if (!entriesQueryResult.Items || entriesQueryResult.Items.length === 0) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'No data for this ticker.' })
            };
        }

        const stockData = {
            priceData: entriesQueryResult.Items,
            metadata: metadataQueryResult.Items || [] 
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(stockData)
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
