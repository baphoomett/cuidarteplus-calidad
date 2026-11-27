import logging


def zap_started(zap, target):
    zap.ascan.set_option_max_scan_duration_in_mins(8)
    zap.ascan.set_option_max_rule_duration_in_mins(2)
    logging.info("ZAP API active scan limits: 8 minutes total, 2 minutes per rule")
