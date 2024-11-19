import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

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

    try {
        const rangeDate = new Date();
        rangeDate.setDate(rangeDate.getDate() - 30);
        const isoRangeDate = rangeDate.toISOString();
        console.log('ISO Range Date:', isoRangeDate);  // Log the date used for filtering

        const scanParams = {
            TableName: tableName,
            FilterExpression: '#date > :date',  // Use #date as an alias for the 'date' attribute
            ExpressionAttributeNames: {
                '#date': 'date',  // Map #date to the 'date' attribute
            },
            ExpressionAttributeValues: {
                ':date': { S: isoRangeDate },
            },
        };

        const popularScanCommand = new ScanCommand(scanParams);
        const result = await dynamoClient.send(popularScanCommand);

        console.log('Result from DynamoDB:', result.Items);  // Log the raw data

        const buyCounts = {};
        const sellCounts = {};

        result.Items.forEach(item => {
            const metadata = item.metadata?.S;
            if (metadata) {
                console.log('Item metadata:', metadata);  // Log the metadata

                const trimmedMetadata = metadata.substring(metadata.indexOf('#') + 1);
                const tickerName = metadata.substring(0, metadata.indexOf('#'));

                if (trimmedMetadata.endsWith('BUY')) {
                    buyCounts[tickerName] = (buyCounts[tickerName] || 0) + 1;
                } else if (trimmedMetadata.endsWith('SELL')) {
                    sellCounts[tickerName] = (sellCounts[tickerName] || 0) + 1;
                }
            }
        });

        console.log('Buy Counts:', buyCounts);  // Log buy counts
        console.log('Sell Counts:', sellCounts);  // Log sell counts

        const sortedBuys = Object.entries(buyCounts)
            .sort((a, b) => b[1] - a[1]) 
            .map(([ticker, count]) => ({ ticker, count }));

        const sortedSells = Object.entries(sellCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([ticker, count]) => ({ ticker, count }));

        const response = {
            mostBuys: sortedBuys,
            mostSells: sortedSells
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(response)
        };
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error querying DynamoDB.'
            })
        };
    }
};
