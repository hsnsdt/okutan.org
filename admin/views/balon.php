<?php
// Balon Patlat yönetimi panelin içinde (/balon/yonetim/ gömülü; jetonu panel üretir, ayrı şifre yok). Ayrıntı: embed_admin() (lib/shell.php)
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
embed_admin('Balon Patlat', '/balon/yonetim/?gomulu=1', 'bp_admin', 'admin', '/balon/', 'Oyunu aç');
