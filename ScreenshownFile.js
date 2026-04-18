const axios = require('axios');
const { exec } = require('child_process');

const GET_URL = "https://dineqrpro.com/varsit/api/print_kotapi";
const UPDATE_URL = "https://dineqrpro.com/varsit/api/insertkotprint";

const BILL_BASE = "https://dineqrpro.com/varsit/billing/viewkot/";


const CHROME_PATH = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

let isPrinting = false;

async function autoPrint() {

    if (isPrinting) return;
    isPrinting = true;

    try {

        const res = await axios.get(GET_URL);

        if (!res.data || res.data.status === false) {
            console.log("No orders");
            isPrinting = false;
            return;
        }

        const { order_id, session_id } = res.data;
        const url = BILL_BASE + session_id;

        console.log("Printing HTML:", url);

        
        const cmd = `${CHROME_PATH} --kiosk-printing --headless --disable-gpu --print-to-pdf-no-header --print-to-default-printer "${url}"`;

        exec(cmd, async (err) => {

            if (err) {
                console.log("Print Error:", err.message);
                isPrinting = false;
                return;
            }

            console.log("Printed Successfully");

            await axios.post(UPDATE_URL, {
                order_id,
                print_status: 1
            });

            isPrinting = false;
        });

    } catch (err) {
        console.log("Error:", err.message);
        isPrinting = false;
    }
}

setInterval(autoPrint, 5000);
