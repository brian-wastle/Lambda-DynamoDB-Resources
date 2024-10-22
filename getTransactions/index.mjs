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

    console.log('Received userID:', userID);
    console.log('Received ticker:', ticker);
    console.log('Table Name:', dynamicTableName);
    console.log('LSI Name:', process.env.LSI_NAME);

    // Validate input parameters
    if (!userID || !ticker) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Bad Request: userID and ticker are required parameters.' })
        };
    }

    try {
        // Query ticker transactions
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

        console.log('Ticker Query Result:', queryResult);

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


        const startDate = '1970-01-01T00:00:00Z'; // Use your desired start date
        const endDate = new Date().toISOString(); // Current date or any end date you prefer
        const rawData = await fetchAllAccountTransactions(userID, dynamicTableName, startDate, endDate);


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
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }) // Log error details
        };
    }
};

const fetchAllAccountTransactions = async (userID, dynamicTableName) => {
    const queryParams = {
        TableName: dynamicTableName,
        IndexName: process.env.LSI_NAME, // Use your LSI here
        KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :tickerPrefix)',
        ExpressionAttributeValues: {
            ':userID': { S: userID },
            ':tickerPrefix': { S: 'ACCOUNT#' }
        },
        ConsistentRead: true
    };

    const queryCommand = new QueryCommand(queryParams);
    const queryResult = await dynamoClient.send(queryCommand);

    return (queryResult.Items || []).map(item => ({
        value: parseFloat(item.value.N),
        metadata: trimMetadata(item.metadata.S),
        date: item.date.S, // If you still need the date, you can keep this
        userID: item.userID.S,
        uuid: item.uuid.S,
    }));
};



const trimMetadata = (metadata) => {
    const parts = metadata.split('#');
    return parts.length > 1 ? parts[1] : parts[0];
};
