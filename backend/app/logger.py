import os
import logging
from datetime import datetime

LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, "cloud_drive.log")

def setup_logger():
    """Configure comprehensive logging to both console and file."""
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"),
            logging.StreamHandler()
        ]
    )

    logger = logging.getLogger("CloudDrive")
    logger.info("=" * 60)
    logger.info(f"Cloud Drive Backend Started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Log file: {LOG_FILE}")
    logger.info("=" * 60)
    return logger

app_logger = setup_logger()
