import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

// Initialize the DynamoDB client
const dynamoClient = new DynamoDBClient({ region: process.env.REGION_NAME });

// CORS headers for responses
const corsHeaders = {
    "Access-Control-Allow-Origin": "http://localhost:4200",
    "Access-Control-Allow-Methods": "OPTIONS,GET",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

// Handle CORS preflight requests
const handleOptions = () => ({
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ message: 'CORS preflight response' }),
});

// Scan DynamoDB table for items containing '#metadata'
const scanForMetadata = async (tableName) => {
    const scanParams = {
        TableName: tableName,
        FilterExpression: 'contains(ticker, :metadata)',
        ExpressionAttributeValues: {
            ':metadata': '#metadata'
        },
    };

    const command = new ScanCommand(scanParams);
    return await dynamoClient.send(command);
};

// Main Lambda handler function
export const handler = async (event) => {
    // Handle preflight CORS request
    if (event.httpMethod === 'OPTIONS') {
        return handleOptions();
    }

    const tableName = process.env.STATIC_TABLE_NAME;

    try {
        const metadataScanResult = await scanForMetadata(tableName);
        const tickerData = metadataScanResult.Items || []; 

        console.log('Ticker data:', tickerData);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(tickerData),
        };
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error querying DynamoDB.',
            }),
        };
    }
};
