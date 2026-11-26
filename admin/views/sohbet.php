<?php
// Canlı Sohbet yönetimi panelin içinde (/sohbet/yonetim/ gömülü; jetonu panel üretir, ayrı şifre yok). Ayrıntı: embed_admin() (lib/shell.php)
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
embed_admin('Canlı Sohbet', '/sohbet/yonetim/?gomulu=1', 'sh_admin', 'sohbet-admin', '/sohbet/', 'Sohbeti aç');
