import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {

    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID, ticker } = event;

//get all transactions for this specific ticker

    try {
        const tickerQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :metadata)',
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':metadata': { S: `${ticker}#` }
            },
            ProjectionExpression: '#d, balance, metadata, units, #v',
            ExpressionAttributeNames: {
                '#d': 'date',  
                '#v': 'value'
            },
            ScanIndexForward: false,
            ConsistentRead: true
        };

        try {
            const tickerQueryCommand = new QueryCommand(tickerQueryParams);
            const tickerQueryResult = await dynamoClient.send(tickerQueryCommand);
            const transactionArray = tickerQueryResult.Items;
            console.log("transactionArray: ", transactionArray);
            const newArray = transactionArray.sort((a, b) => {
                const dateA = new Date(a.date.S).getTime();
                const dateB = new Date(b.date.S).getTime();
                return dateB - dateA;
            });
            console.log("newArray: ", newArray);
        } catch (error) {
            console.error(`DynamoDB error for ticker ${ticker}:`, error);
        }

        return {
            statusCode: 200,
            body: JSON.stringify('Success!')
        }

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        }
    }
}