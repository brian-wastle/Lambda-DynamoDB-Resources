import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
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
        const queryParams = {
            TableName: dynamicTableName,
            IndexName: process.env.LSI_NAME,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :tickerPrefix)',
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':tickerPrefix': { S: `${ticker}#` }
            },
            ConsistentRead: true
        };

        const queryCommand = new QueryCommand(queryParams);
        const queryResult = await dynamoClient.send(queryCommand);

        const tickerTransactions = (queryResult.Items || []).map(item => ({
            value: parseFloat(item.value.N),
            metadata: trimMetadata(item.metadata.S),
            date: item.date.S,
            balance: parseFloat(item.balance.N),
            userID: item.userID.S,
            units: parseFloat(item.units.N),
            uuid: item.uuid.S,
        }));


        const uuidArray = tickerTransactions.map(transaction => transaction.uuid);
        const rawData = await fetchAllAccountTransactions(userID, dynamicTableName);
        const accountTransactions = rawData.filter(account =>
            uuidArray.includes(account.uuid)
        );

        const transactionsWithAccountData = {
            tickerTransactions,
            accountTransactions
        };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(transactionsWithAccountData)
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

const fetchAllAccountTransactions = async (userID, dynamicTableName) => {

    const queryParams = {
        TableName: dynamicTableName,
        KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :accountPrefix)',
        ExpressionAttributeValues: {
            ':userID': { S: userID },
            ':accountPrefix': { S: 'ACCOUNT#' }
        },
        ConsistentRead: true
    };

    const queryCommand = new QueryCommand(queryParams);
    const queryResult = await dynamoClient.send(queryCommand);

    return (queryResult.Items || []).map(item => ({
        value: parseFloat(item.value.N),
        metadata: trimMetadata(item.metadata.S),
        date: item.date.S,
        userID: item.userID.S,
        uuid: item.uuid.S,
    }));
};

const trimMetadata = (metadata) => {
    const parts = metadata.split('#');
    return parts.length > 1 ? parts[1] : parts[0];
};
